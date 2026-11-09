"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import type { LeadStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { LEAD_STATUSES, normalizeLead, parseVendorDate } from "@/lib/leads";
import {
  scrubFields,
  loadInternalDncSet,
  addToInternalDnc,
  removeFromInternalDnc,
} from "@/lib/dnc";
import { pickNextAssignee } from "@/lib/settings";
import { sendSms, smsConfigured, canText } from "@/lib/sms";
import { parseVehicles, cleanVehicles } from "@/lib/vehicles";
import { parseDrivers, cleanDrivers } from "@/lib/drivers";
import { lookupNewLead } from "@/app/actions/property";
import { buildFollowUpIcs, followUpUid } from "@/lib/calendar";
import { sendEmail, followUpReminderEmail } from "@/lib/email";
import { notifyNewLead } from "@/lib/notify";
import {
  blockers, blockersMessage, isCarrier, type AaaLine, type SoldAnswers,
} from "@/lib/sold-docs";
import { canViewLead } from "@/lib/visibility";

async function authUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** A lead an agent may act on: admins may act on all, agents only on their own. */
async function loadEditableLead(leadId: string) {
  const user = await authUser();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role !== "ADMIN" && lead.assignedToId !== user.id) {
    throw new Error("You can only edit leads assigned to you");
  }
  return { user, lead };
}

/**
 * For serving a customer rather than working a prospect.
 *
 * Once a household is sold it belongs to the agency, so whoever picks up the
 * phone can note what was said and file what was sent — they shouldn't have
 * to track down the agent who wrote the policy to get a conversation on the
 * record. A prospect someone else is working stays theirs.
 */
async function loadServiceableLead(leadId: string) {
  const user = await authUser();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (!canViewLead(user, lead)) {
    throw new Error("That record belongs to another agent");
  }
  return { user, lead };
}

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Listed drivers arrive as one JSON field from the drivers editor. */
function driversField(formData: FormData): Prisma.InputJsonValue | undefined {
  const raw = formData.get("drivers");
  if (typeof raw !== "string") return undefined;
  try {
    return cleanDrivers(parseDrivers(JSON.parse(raw))) as unknown as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

/** Listed vehicles arrive as one JSON field from the vehicles editor. */
function vehicles(formData: FormData): Prisma.InputJsonValue | undefined {
  const raw = formData.get("vehicles");
  if (typeof raw !== "string") return undefined;
  try {
    return cleanVehicles(parseVehicles(JSON.parse(raw))) as unknown as Prisma.InputJsonValue;
  } catch {
    return undefined; // malformed input never wipes what's already saved
  }
}

export async function createLead(formData: FormData): Promise<void> {
  const user = await authUser();
  const dnc = await scrubFields(str(formData, "phone"));

  const lead = await db.lead.create({
    data: {
      firstName: str(formData, "firstName"),
      lastName: str(formData, "lastName"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      address1: str(formData, "address1"),
      city: str(formData, "city"),
      state: str(formData, "state"),
      zip: str(formData, "zip"),
      product: str(formData, "product"),
      source: "Manual entry",
      vehicles: vehicles(formData),
      ...dnc,
      assignedToId:
        user.role === "ADMIN" ? str(formData, "assignedToId") : user.id,
      activities: {
        create: { type: "CREATED", body: `Lead created by ${user.name}`, userId: user.id },
      },
    },
  });

  after(() => lookupNewLead(lead.id));

  revalidatePath("/leads");
  redirect(`/leads/${lead.id}`);
}

export async function updateLeadDetails(
  leadId: string,
  formData: FormData,
): Promise<void> {
  const { lead } = await loadEditableLead(leadId);

  const premiumRaw = str(formData, "premium");
  const premium = premiumRaw ? Number(premiumRaw.replace(/[^0-9.]/g, "")) : null;

  // Re-scrub only when the phone number actually changed.
  const newPhone = str(formData, "phone");
  const dnc = newPhone !== lead.phone ? await scrubFields(newPhone) : {};

  await db.lead.update({
    where: { id: leadId },
    data: {
      firstName: str(formData, "firstName"),
      lastName: str(formData, "lastName"),
      email: str(formData, "email"),
      phone: newPhone,
      phoneSecondary: str(formData, "phoneSecondary"),
      address1: str(formData, "address1"),
      address2: str(formData, "address2"),
      city: str(formData, "city"),
      state: str(formData, "state"),
      zip: str(formData, "zip"),
      dob: str(formData, "dob"),
      maritalStatus: str(formData, "maritalStatus"),
      product: str(formData, "product"),
      premium: premium != null && !Number.isNaN(premium) ? premium : null,
      carrier: str(formData, "carrier"),
      policyNumber: str(formData, "policyNumber"),
      externalId: str(formData, "externalId"),
      effectiveDate: str(formData, "effectiveDate"),
      currentCarrier: str(formData, "currentCarrier"),
      policyExpiresAt: parseVendorDate(str(formData, "policyExpiresAt") ?? undefined) ?? null,
      notes: str(formData, "notes"),
      vehicles: vehicles(formData),
      drivers: driversField(formData),
      ...dnc,
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function setLeadStatus(
  leadId: string,
  status: LeadStatus,
): Promise<{ ok: boolean; message?: string }> {
  if (!LEAD_STATUSES.includes(status)) throw new Error("Invalid status");
  const { user, lead } = await loadEditableLead(leadId);
  if (lead.status === status) return { ok: true };

  // Sales only happen through Mark sold. That's where the premium, the term and
  // the required paperwork are collected, and it's what creates the policy under
  // Agency Management — a lead flipped to Sold here would never get one.
  if (status === "SOLD") {
    return {
      ok: false,
      message: "Use the Mark sold button — it collects the policy details and the required paperwork.",
    };
  }

  // A household with a policy in force is a customer, whatever else is going
  // on. Letting the dropdown move them back to New took a real customer out
  // of the shared book in one click, quietly — it happened. Cancelling the
  // policy is how a customer stops being one.
  if (lead.status === "SOLD") {
    const inForce = await db.policy.count({
      where: { leadId, status: "ACTIVE" },
    });
    if (inForce > 0) {
      return {
        ok: false,
        message:
          `This customer has ${inForce === 1 ? "a policy" : `${inForce} policies`} in force. ` +
          "Cancel the policy under Book of business if the business is gone.",
      };
    }
  }

  // A status change without a next touch is how leads go quiet, so moving a
  // lead forward schedules one when none exists. Closed statuses clear it.
  const CADENCE: Partial<Record<LeadStatus, number>> = { CONTACTED: 2, QUOTED: 1, NEW: 1 };
  const closed = status === "LOST" || status === "DNC";
  let followUpAt = lead.followUpAt;
  if (closed) followUpAt = null;
  else if (!lead.followUpAt && CADENCE[status] != null) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + (CADENCE[status] as number));
    followUpAt = d;
  }

  await db.lead.update({
    where: { id: leadId },
    data: {
      status,
      followUpAt,
      contactedAt:
        status === "CONTACTED" && !lead.contactedAt ? new Date() : lead.contactedAt,
      // Sold is refused above, so any status set here is a lead that isn't sold.
      soldAt: null,
      activities: {
        create: {
          type: "STATUS_CHANGE",
          body: `Status changed to ${status} by ${user.name}`,
          userId: user.id,
        },
      },
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function assignLead(
  leadId: string,
  assigneeId: string,
): Promise<void> {
  const user = await authUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can assign leads");

  const target = assigneeId
    ? await db.user.findUnique({ where: { id: assigneeId } })
    : null;

  await db.lead.update({
    where: { id: leadId },
    data: {
      assignedToId: assigneeId || null,
      activities: {
        create: {
          type: "ASSIGNMENT",
          body: target ? `Assigned to ${target.name}` : "Unassigned",
          userId: user.id,
        },
      },
    },
  });

  // Let the new owner know, unless they assigned it to themselves.
  if (target && target.id !== user.id) after(() => notifyNewLead(leadId));

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function addNote(leadId: string, formData: FormData): Promise<void> {
  const { user } = await loadServiceableLead(leadId);
  const body = str(formData, "body");
  if (!body) return;

  await db.activity.create({
    data: { leadId, userId: user.id, type: "NOTE", body },
  });

  revalidatePath(`/leads/${leadId}`);
}

/** Log a call or text outcome; advances a NEW lead to CONTACTED. */
export async function logContact(
  leadId: string,
  kind: "CALL" | "SMS",
  outcome: string,
  note: string,
): Promise<void> {
  const { user, lead } = await loadServiceableLead(leadId);
  const verb = kind === "CALL" ? "Call" : "Text";
  const body = `${verb}: ${outcome}${note.trim() ? ` — ${note.trim()}` : ""}`;
  await db.lead.update({
    where: { id: leadId },
    data: {
      contactedAt: new Date(),
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
      activities: { create: { type: kind, body, userId: user.id } },
    },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

/** Add this lead's number to the internal Do-Not-Call list and mark it blocked. */
export async function markLeadDnc(leadId: string): Promise<void> {
  const { user, lead } = await loadEditableLead(leadId);
  if (lead.phone) {
    await addToInternalDnc(lead.phone, `Marked by ${user.name}`, user.name);
  }
  await db.lead.update({
    where: { id: leadId },
    data: {
      dncStatus: "BLOCKED",
      dncReason: "On your internal Do-Not-Call list",
      dncCheckedAt: new Date(),
      activities: {
        create: { type: "DNC", body: `Added to Do-Not-Call by ${user.name}`, userId: user.id },
      },
    },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/** Remove this lead's number from the internal DNC list and re-scrub. */
export async function clearLeadDnc(leadId: string): Promise<void> {
  const { user, lead } = await loadEditableLead(leadId);
  if (lead.phone) await removeFromInternalDnc(lead.phone);
  const dnc = await scrubFields(lead.phone);
  await db.lead.update({
    where: { id: leadId },
    data: {
      ...dnc,
      activities: {
        create: { type: "DNC", body: `Removed from Do-Not-Call by ${user.name}`, userId: user.id },
      },
    },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/** Re-run the scrub for a single lead. */
export async function rescrubLead(leadId: string): Promise<void> {
  const { lead } = await loadEditableLead(leadId);
  const dnc = await scrubFields(lead.phone);
  await db.lead.update({ where: { id: leadId }, data: dnc });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function setFollowUp(leadId: string, dateStr: string): Promise<void> {
  const { user, lead } = await loadEditableLead(leadId);
  const date = dateStr ? new Date(dateStr) : null;
  await db.lead.update({
    where: { id: leadId },
    data: {
      followUpAt: date && !Number.isNaN(date.getTime()) ? date : null,
      activities: {
        create: {
          type: "NOTE",
          body: date
            ? `Follow-up set for ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
            : "Follow-up cleared",
          userId: user.id,
        },
      },
    },
  });

  // Send the agent a calendar invite so the reminder lands in Outlook. Done
  // after the response so a slow mail API never blocks saving the follow-up.
  if (date && !Number.isNaN(date.getTime())) {
    after(() => sendFollowUpInvite(leadId, date, lead.assignedToId ?? user.id));
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

/**
 * Schedules the next touch N days out. Separate from setFollowUp so the
 * one-click buttons read clearly at the call site, and so a quick "+3 days"
 * still sends the calendar invite an agent expects.
 */
export async function setNextStep(leadId: string, days: number): Promise<void> {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.min(365, Math.round(days))));
  await setFollowUp(leadId, date.toISOString().slice(0, 10));
}

/**
 * Marks a lead sold and records what was written. Capturing premium and
 * carrier here is what makes cost-per-sale by vendor possible later.
 */
export async function markSold(
  leadId: string,
  details: {
    premium?: string;
    carrier?: string;
    policyNumber?: string;
    effectiveDate?: string;
    product?: string;
    termMonths?: string;
    line?: AaaLine | null;
    priorAutoDeclared?: boolean;
    windMitDiscount?: boolean;
  },
): Promise<{ ok: boolean; message?: string }> {
  const { user, lead } = await loadEditableLead(leadId);

  // The paperwork has to be on the record before the sale exists. The dialog
  // checks this too, but the rule is enforced here — that's the only place it
  // can't be clicked past.
  const answers: SoldAnswers = {
    carrier: isCarrier(details.carrier) ? details.carrier : null,
    line: details.line === "AUTO" || details.line === "PACKAGE" ? details.line : null,
    priorAutoDeclared: Boolean(details.priorAutoDeclared),
    windMitDiscount: Boolean(details.windMitDiscount),
    policyNumber: (details.policyNumber ?? "").trim(),
  };
  if (!answers.carrier) {
    return { ok: false, message: "Choose what was sold before recording the sale." };
  }
  const onFile = await db.policyDocument.findMany({
    where: { leadId, kind: { not: null } },
    select: { kind: true },
  });
  const outstanding = blockers(answers, onFile.map((d) => d.kind));
  if (outstanding.length > 0) {
    return { ok: false, message: blockersMessage(outstanding) };
  }

  const premiumRaw = (details.premium ?? "").replace(/[^0-9.]/g, "");
  const premium = premiumRaw ? Number(premiumRaw) : null;

  const parts = [
    answers.carrier,
    answers.line === "PACKAGE" ? "package" : answers.line === "AUTO" ? "auto" : null,
    `policy ${answers.policyNumber}`,
    premium ? `premium $${premium.toLocaleString("en-US")}` : null,
    answers.priorAutoDeclared ? "prior auto declared" : null,
    answers.windMitDiscount ? "wind mitigation discount" : null,
  ].filter(Boolean);

  await db.lead.update({
    where: { id: leadId },
    data: {
      status: "SOLD",
      // This is the moment they stop being the selling agent's prospect and
      // become the agency's customer, findable by anyone who picks up.
      isCustomer: true,
      soldAt: lead.soldAt ?? new Date(),
      contactedAt: lead.contactedAt ?? new Date(),
      followUpAt: null,
      premium: premium != null && !Number.isNaN(premium) ? premium : lead.premium,
      carrier: answers.carrier,
      policyNumber: answers.policyNumber,
      effectiveDate: details.effectiveDate?.trim() || lead.effectiveDate,
      activities: {
        create: {
          type: "STATUS_CHANGE",
          body: `Sold by ${user.name}${parts.length ? ` — ${parts.join(", ")}` : ""}`,
          userId: user.id,
        },
      },
    },
  });

  // The sale becomes a policy under Agency Management. Expiration comes from
  // the term, which is what later surfaces it for renewal on its own.
  const effectiveAt = parseVendorDate(details.effectiveDate ?? undefined) ?? new Date();
  const termMonths = details.termMonths === "6" ? 6 : 12;
  const expiresAt = new Date(effectiveAt);
  expiresAt.setMonth(expiresAt.getMonth() + termMonths);

  await db.policy.create({
    data: {
      leadId,
      // For AAA the line is what was actually written; elsewhere the lead's
      // product is the best description we have.
      product:
        answers.line === "PACKAGE"
          ? "Package"
          : answers.line === "AUTO"
            ? "Auto"
            : details.product?.trim() || lead.product,
      carrier: answers.carrier,
      policyNumber: answers.policyNumber,
      premium: premium != null && !Number.isNaN(premium) ? premium : lead.premium,
      termMonths,
      effectiveAt,
      expiresAt,
      soldById: lead.assignedToId ?? user.id,
      autoIncluded: answers.line != null,
      packagePolicy: answers.line === "PACKAGE",
      priorAutoDeclared: answers.priorAutoDeclared,
      windMitDiscount: answers.windMitDiscount,
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/agency");
  return { ok: true };
}

/** Takes a policy out of force, with a reason for the record. */
export async function cancelPolicy(policyId: string, reason: string): Promise<void> {
  const user = await authUser();
  const policy = await db.policy.findUnique({ where: { id: policyId }, include: { lead: true } });
  if (!policy) throw new Error("Policy not found");
  if (user.role !== "ADMIN" && policy.soldById !== user.id) {
    throw new Error("You can only change policies you wrote");
  }

  await db.policy.update({
    where: { id: policyId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() || null },
  });

  await db.activity.create({
    data: {
      leadId: policy.leadId,
      type: "STATUS_CHANGE",
      body: `Policy ${policy.policyNumber ?? ""} cancelled by ${user.name}${reason ? ` — ${reason}` : ""}`.replace(/\s+/g, " "),
      userId: user.id,
    },
  });

  revalidatePath("/agency");
  revalidatePath(`/leads/${policy.leadId}`);
}

/** Puts a cancelled policy back in force, for a cancellation entered in error. */
export async function reinstatePolicy(policyId: string): Promise<void> {
  const user = await authUser();
  const policy = await db.policy.findUnique({ where: { id: policyId } });
  if (!policy) throw new Error("Policy not found");
  if (user.role !== "ADMIN" && policy.soldById !== user.id) {
    throw new Error("You can only change policies you wrote");
  }
  await db.policy.update({
    where: { id: policyId },
    data: { status: "ACTIVE", cancelledAt: null, cancelReason: null },
  });
  revalidatePath("/agency");
}

/** Renews a policy for another term, keeping the original on the record. */
export async function renewPolicy(policyId: string, premium?: string): Promise<void> {
  const user = await authUser();
  const policy = await db.policy.findUnique({ where: { id: policyId } });
  if (!policy) throw new Error("Policy not found");
  if (user.role !== "ADMIN" && policy.soldById !== user.id) {
    throw new Error("You can only change policies you wrote");
  }

  const effectiveAt = new Date(policy.expiresAt);
  const expiresAt = new Date(effectiveAt);
  expiresAt.setMonth(expiresAt.getMonth() + policy.termMonths);
  const newPremium = premium ? Number(premium.replace(/[^0-9.]/g, "")) : null;

  await db.policy.create({
    data: {
      leadId: policy.leadId,
      product: policy.product,
      carrier: policy.carrier,
      policyNumber: policy.policyNumber,
      premium: newPremium && !Number.isNaN(newPremium) ? newPremium : policy.premium,
      termMonths: policy.termMonths,
      effectiveAt,
      expiresAt,
      soldById: policy.soldById,
      notes: `Renewal of the term beginning ${policy.effectiveAt.toISOString().slice(0, 10)}`,
    },
  });

  await db.activity.create({
    data: {
      leadId: policy.leadId,
      type: "STATUS_CHANGE",
      body: `Policy ${policy.policyNumber ?? ""} renewed for another ${policy.termMonths} months by ${user.name}`.replace(/\s+/g, " "),
      userId: user.id,
    },
  });

  revalidatePath("/agency");
}

/** Emails the assigned agent an .ics invite carrying a 30-minute reminder. */
async function sendFollowUpInvite(leadId: string, date: Date, agentId: string): Promise<void> {
  try {
    const [lead, agent] = await Promise.all([
      db.lead.findUnique({ where: { id: leadId } }),
      db.user.findUnique({ where: { id: agentId } }),
    ]);
    if (!lead || !agent?.email) return;

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const leadUrl = `${base}/leads/${leadId}`;
    const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "this lead";
    const when = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

    const ics = buildFollowUpIcs({
      uid: followUpUid(leadId),
      date, leadName, leadUrl,
      phone: lead.phone,
      notes: lead.notes,
      attendeeEmail: agent.email,
      attendeeName: agent.name,
      organizerEmail: process.env.RESET_EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? process.env.RESET_EMAIL_FROM ?? agent.email,
      method: "REQUEST",
    });

    const { subject, html } = followUpReminderEmail({
      agentFirstName: (agent.name ?? "").split(" ")[0] || "there",
      leadName, when, phone: lead.phone, leadUrl,
    });

    await sendEmail({
      to: agent.email,
      subject, html,
      attachments: [{
        filename: "follow-up.ics",
        content: Buffer.from(ics, "utf8").toString("base64"),
        contentType: "text/calendar; method=REQUEST",
      }],
    });
  } catch (err) {
    console.error("[followup] calendar invite failed", leadId, err);
  }
}

export async function addLeadTag(leadId: string, tag: string): Promise<void> {
  const { lead } = await loadEditableLead(leadId);
  const clean = tag.trim().slice(0, 30);
  if (!clean || lead.tags.includes(clean)) return;
  await db.lead.update({
    where: { id: leadId },
    data: { tags: { set: [...lead.tags, clean] } },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function removeLeadTag(leadId: string, tag: string): Promise<void> {
  const { lead } = await loadEditableLead(leadId);
  await db.lead.update({
    where: { id: leadId },
    data: { tags: { set: lead.tags.filter((t) => t !== tag) } },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function sendManualSms(
  leadId: string,
  body: string,
): Promise<{ ok?: boolean; error?: string }> {
  const { user, lead } = await loadEditableLead(leadId);
  const text = body.trim();
  if (!text) return { error: "Enter a message." };
  if (!smsConfigured()) {
    return { error: "Texting isn't set up yet — add your Twilio keys in Settings." };
  }
  if (!canText(lead)) {
    return { error: "Can't text this lead (no phone, on the DNC list, or opted out)." };
  }
  if (!(await sendSms(lead.phone!, text))) {
    return { error: "The text failed to send. Check your Twilio setup." };
  }
  await db.lead.update({
    where: { id: leadId },
    data: {
      contactedAt: new Date(),
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
      activities: { create: { type: "SMS", body: `Text sent by ${user.name}: ${text}`, userId: user.id } },
    },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

export async function deleteLead(leadId: string): Promise<void> {
  const user = await authUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can delete leads");
  await db.lead.delete({ where: { id: leadId } });
  revalidatePath("/leads");
  redirect("/leads");
}

export async function bulkAssign(
  leadIds: string[],
  assigneeId: string,
): Promise<void> {
  const user = await authUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can assign leads");
  if (leadIds.length === 0) return;

  await db.lead.updateMany({
    where: { id: { in: leadIds } },
    data: { assignedToId: assigneeId || null },
  });
  revalidatePath("/leads");
}

export async function bulkDelete(leadIds: string[]): Promise<void> {
  const user = await authUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can delete leads");
  if (leadIds.length === 0) return;
  await db.lead.deleteMany({ where: { id: { in: leadIds } } });
  revalidatePath("/leads");
}

export async function bulkSetStatus(
  leadIds: string[],
  status: LeadStatus,
): Promise<{ ok: boolean; message?: string }> {
  const user = await authUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can do that");
  if (!LEAD_STATUSES.includes(status) || leadIds.length === 0) return { ok: true };

  // Same reason as setLeadStatus: a sale needs its premium, term, paperwork and
  // policy record, none of which a bulk status change can produce.
  if (status === "SOLD") {
    return {
      ok: false,
      message: "Sales have to go through Mark sold on the lead, one at a time — that's what creates the policy.",
    };
  }

  // Customers with a policy in force are left alone, the same as they are on
  // the lead page. A bulk status change is the easiest way to lose a dozen of
  // them out of the book at once.
  const protectedIds = (
    await db.policy.findMany({
      where: { leadId: { in: leadIds }, status: "ACTIVE" },
      select: { leadId: true },
      distinct: ["leadId"],
    })
  ).map((p) => p.leadId);

  const changeable = leadIds.filter((id) => !protectedIds.includes(id));
  if (changeable.length === 0) {
    return {
      ok: false,
      message: "Every lead selected has a policy in force. Cancel the policy under Book of business instead.",
    };
  }

  await db.lead.updateMany({
    where: { id: { in: changeable } },
    data: { status, soldAt: null },
  });
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/customers");

  return protectedIds.length > 0
    ? {
        ok: true,
        message:
          `${changeable.length} changed. ${protectedIds.length} skipped — ` +
          "they have policies in force and stay in the customer book.",
      }
    : { ok: true };
}

export async function bulkAddTag(leadIds: string[], tag: string): Promise<void> {
  const user = await authUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can do that");
  const clean = tag.trim().slice(0, 30);
  if (!clean || leadIds.length === 0) return;
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, tags: true },
  });
  for (const l of leads) {
    if (!l.tags.includes(clean)) {
      await db.lead.update({
        where: { id: l.id },
        data: { tags: { set: [...l.tags, clean] } },
      });
    }
  }
  revalidatePath("/leads");
}

export type ImportResult = { imported: number; skipped: number };

/** Import an array of raw rows (e.g. parsed CSV) under a given vendor. */
export async function importLeads(
  vendorId: string,
  rows: Record<string, unknown>[],
): Promise<ImportResult> {
  const user = await authUser();
  const vendor = vendorId
    ? await db.vendor.findUnique({ where: { id: vendorId } })
    : null;

  let imported = 0;
  let skipped = 0;
  const createdIds: string[] = [];

  // Preload the internal DNC list once so each row is a fast in-memory check.
  const dncSet = await loadInternalDncSet();

  for (const row of rows) {
    const n = normalizeLead(row);
    // Require at least a name, phone, or email to be a usable lead.
    if (!n.firstName && !n.lastName && !n.phone && !n.email) {
      skipped++;
      continue;
    }
    const dnc = await scrubFields(n.phone ?? null, dncSet);
    const assignedToId = await pickNextAssignee();
    const data: Prisma.LeadCreateInput = {
      firstName: n.firstName ?? null,
      lastName: n.lastName ?? null,
      email: n.email ?? null,
      phone: n.phone ?? null,
      phoneSecondary: n.phoneSecondary ?? null,
      address1: n.address1 ?? null,
      address2: n.address2 ?? null,
      city: n.city ?? null,
      state: n.state ?? null,
      zip: n.zip ?? null,
      dob: n.dob ?? null,
      maritalStatus: n.maritalStatus ?? null,
      product: n.product ?? null,
      premium: n.premium ?? null,
      externalId: n.externalId ?? null,
      source: vendor ? `${vendor.name} (import)` : "CSV import",
      rawPayload: row as Prisma.InputJsonValue,
      ...dnc,
      ...(assignedToId ? { assignedTo: { connect: { id: assignedToId } } } : {}),
      ...(vendor ? { vendor: { connect: { id: vendor.id } } } : {}),
      activities: {
        create: { type: "IMPORTED", body: `Imported by ${user.name}`, userId: user.id },
      },
    };
    const created = await db.lead.create({ data });
    createdIds.push(created.id);
    imported++;
  }

  // Ownership and homestead for everyone who just arrived. Done after the
  // response, one at a time, because a tax-roll call per row would make a
  // five-hundred-line import time out.
  after(async () => {
    for (const id of createdIds) await lookupNewLead(id, user.agencyId);
  });

  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return { imported, skipped };
}
