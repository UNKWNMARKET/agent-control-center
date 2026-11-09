"use server";

import { revalidatePath } from "next/cache";
import { unscopedDb, dbFor } from "@/lib/db";
import { requireOwner, requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import {
  newInviteToken, inviteExpiry, inviteUrl, slugifyAgency,
} from "@/lib/invites";

/**
 * Creating and running agencies.
 *
 * Only the platform owner reaches the first half of this file, and it is the
 * one place that deliberately looks across agencies. The second half is for
 * an agency's own admin inviting their staff, and is scoped to them.
 */

export type Result = { ok: boolean; message?: string; inviteLink?: string };

const clean = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

/* ── Owner: standing up an agency ─────────────────────────────────────── */

/**
 * Creates an agency and invites its first admin.
 *
 * No password is set here and none is emailed. The admin follows a link and
 * chooses their own, which means a password this platform never knew.
 */
export async function createAgency(formData: FormData): Promise<Result> {
  await requireOwner();

  const name = clean(formData.get("name"));
  const adminName = clean(formData.get("adminName"));
  const adminEmail = clean(formData.get("adminEmail")).toLowerCase();
  const feeRaw = clean(formData.get("monthlyFee")).replace(/[^0-9.]/g, "");

  if (!name) return { ok: false, message: "The agency needs a name." };
  if (!adminName) return { ok: false, message: "Who is their admin?" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return { ok: false, message: "That admin email doesn't look right." };
  }

  // Email is unique across the platform, so this is caught before anything
  // is created rather than as a failed insert halfway through.
  const taken = await unscopedDb.user.findUnique({ where: { email: adminEmail } });
  if (taken) {
    return { ok: false, message: "Somebody already signs in with that email address." };
  }

  let slug = slugifyAgency(name);
  for (let i = 2; await unscopedDb.agency.findUnique({ where: { slug } }); i++) {
    slug = `${slugifyAgency(name)}-${i}`;
  }

  const agency = await unscopedDb.agency.create({
    data: {
      name,
      slug,
      monthlyFee: feeRaw ? Number(feeRaw) : null,
      billingNotes: clean(formData.get("billingNotes")) || null,
    },
  });

  const { token, tokenHash } = newInviteToken();
  await unscopedDb.invite.create({
    data: {
      agencyId: agency.id,
      email: adminEmail,
      name: adminName,
      role: "ADMIN",
      tokenHash,
      expiresAt: inviteExpiry(),
    },
  });

  const link = inviteUrl(token);
  await sendEmail({
    to: adminEmail,
    subject: `Your ${name} workspace is ready`,
    html: invitationHtml(adminName, name, link),
  });

  revalidatePath("/owner");
  // Handed back as well as emailed: email goes astray, and the owner often
  // wants to pass the link on directly.
  return { ok: true, message: `${name} created and ${adminName} invited.`, inviteLink: link };
}

/** Stops an agency's logins without touching a row of their data. */
export async function setAgencyStatus(
  agencyId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<Result> {
  await requireOwner();
  await unscopedDb.agency.update({ where: { id: agencyId }, data: { status } });
  revalidatePath("/owner");
  return {
    ok: true,
    message: status === "SUSPENDED" ? "Suspended. Their data is untouched." : "Back on.",
  };
}

/** Records a payment by hand — Zelle, monthly. */
export async function recordPayment(agencyId: string, formData: FormData): Promise<Result> {
  await requireOwner();
  const paidThrough = clean(formData.get("paidThrough"));
  const notes = clean(formData.get("billingNotes"));

  await unscopedDb.agency.update({
    where: { id: agencyId },
    data: {
      paidThrough: paidThrough ? new Date(`${paidThrough}T12:00:00`) : null,
      ...(notes ? { billingNotes: notes } : {}),
      // Paying is what brings a suspended agency back.
      ...(paidThrough ? { status: "ACTIVE" as const } : {}),
    },
  });
  revalidatePath("/owner");
  return { ok: true, message: "Updated." };
}

/* ── Agency admin: bringing staff on ──────────────────────────────────── */

export async function inviteStaff(formData: FormData): Promise<Result> {
  const user = await requireAdmin();

  const name = clean(formData.get("name"));
  const email = clean(formData.get("email")).toLowerCase();
  const role = clean(formData.get("role")) === "ADMIN" ? "ADMIN" : "AGENT";

  if (!name) return { ok: false, message: "Who is this?" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "That email doesn't look right." };
  }

  const taken = await unscopedDb.user.findUnique({ where: { email } });
  if (taken) {
    return { ok: false, message: "Somebody already signs in with that email address." };
  }

  const { token, tokenHash } = newInviteToken();
  await dbFor(user.agencyId).invite.create({
    data: { email, name, role, tokenHash, expiresAt: inviteExpiry(), invitedBy: user.id },
  });

  const link = inviteUrl(token);
  await sendEmail({
    to: email,
    subject: `${user.agency.name} — your login`,
    html: invitationHtml(name, user.agency.name, link),
  });

  revalidatePath("/team");
  return { ok: true, message: `${name} invited.`, inviteLink: link };
}

/** Withdraws an invitation that hasn't been used. */
export async function revokeInvite(inviteId: string): Promise<Result> {
  const user = await requireAdmin();
  await dbFor(user.agencyId).invite.deleteMany({ where: { id: inviteId, acceptedAt: null } });
  revalidatePath("/team");
  return { ok: true, message: "Invitation withdrawn." };
}

function invitationHtml(person: string, agency: string, link: string): string {
  return `
  <div style="background:#f5f5f7;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:18px;border:1px solid #e3e3e6;overflow:hidden;">
      <div style="padding:26px 30px 8px;">
        <div style="font-size:18px;font-weight:600;color:#1d1d1f;">${agency}</div>
      </div>
      <div style="padding:4px 30px 28px;">
        <p style="font-size:15px;color:#424245;line-height:1.55;margin:0 0 18px;">
          ${person}, your login for ${agency} is ready. Choose a password and you're in.
        </p>
        <a href="${link}" style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:11px 22px;border-radius:999px;">Set your password</a>
        <p style="font-size:13px;color:#86868b;line-height:1.5;margin:18px 0 0;">
          The link works once and expires in two weeks. If it has run out, ask for another.
        </p>
      </div>
    </div>
  </div>`;
}
