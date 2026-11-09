"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import {
  normalizePhone,
  addToInternalDnc,
  removeFromInternalDnc,
  scrubFields,
  loadInternalDncSet,
} from "@/lib/dnc";
import type { ActionState } from "./users";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (user.role !== "ADMIN") throw new Error("Admins only");
  return user;
}

/** Re-evaluate every lead whose phone matches one of these normalized numbers. */
async function restampLeads(numbers: Set<string>): Promise<number> {
  if (numbers.size === 0) return 0;
  const leads = await db.lead.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  let touched = 0;
  for (const lead of leads) {
    const n = normalizePhone(lead.phone);
    if (n && numbers.has(n)) {
      const dnc = await scrubFields(lead.phone);
      await db.lead.update({ where: { id: lead.id }, data: dnc });
      touched++;
    }
  }
  return touched;
}

/** Add one or many numbers (pasted, any format) to the internal DNC list. */
export async function addDncNumbers(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdminUser();

  const raw = String(formData.get("numbers") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const tokens = raw.split(/[\s,;]+/).filter(Boolean);
  const normalized = [
    ...new Set(tokens.map((t) => normalizePhone(t)).filter(Boolean) as string[]),
  ];

  if (normalized.length === 0) {
    return { error: "Enter at least one valid 10-digit phone number." };
  }

  for (const phone of normalized) {
    await addToInternalDnc(phone, reason, admin.name);
  }
  const touched = await restampLeads(new Set(normalized));

  revalidatePath("/dnc");
  revalidatePath("/leads");
  revalidatePath("/dashboard");

  const n = normalized.length;
  return {
    ok: true,
    message:
      `Added ${n} number${n > 1 ? "s" : ""} to the Do-Not-Call list` +
      (touched ? `, flagged ${touched} existing lead${touched > 1 ? "s" : ""}.` : "."),
  };
}

/** Re-scrub every lead's phone against the current DNC list + provider. */
export async function rescrubAllLeads(): Promise<number> {
  await requireAdminUser();
  const set = await loadInternalDncSet();
  const leads = await db.lead.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true },
  });
  let count = 0;
  for (const lead of leads) {
    const dnc = await scrubFields(lead.phone, set);
    await db.lead.update({ where: { id: lead.id }, data: dnc });
    count++;
  }
  revalidatePath("/dnc");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  return count;
}

/** Remove a number from the internal DNC list and re-scrub matching leads. */
export async function removeDncNumber(phone: string): Promise<void> {
  await requireAdminUser();
  await removeFromInternalDnc(phone);
  const n = normalizePhone(phone);
  if (n) await restampLeads(new Set([n]));
  revalidatePath("/dnc");
  revalidatePath("/leads");
}
