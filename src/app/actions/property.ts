"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { lookupProperty, readProperty, type PropertyInfo } from "@/lib/property";
import { lookupPermits, readPermits, permitsConfigured, type PermitInfo } from "@/lib/permits";

const asJson = (info: PropertyInfo) => info as unknown as Prisma.InputJsonValue;

/** Looks the lead's address up in the state tax roll and caches it on the lead. */
export async function refreshProperty(leadId: string, force = false): Promise<PropertyInfo | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role !== "ADMIN" && lead.assignedToId !== user.id) {
    throw new Error("You can only work leads assigned to you");
  }

  const cached = readProperty(lead.property);
  if (cached && !force) return cached;

  const info = await lookupProperty(lead);
  await db.lead.update({ where: { id: leadId }, data: { property: asJson(info) } });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return info;
}

/**
 * Fills in every lead that has never been looked up. Runs in small batches so
 * one click can't hang on hundreds of outbound calls.
 */
export async function backfillProperties(limit = 25): Promise<{ done: number; remaining: number }> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("Admins only");

  const pending = await db.lead.findMany({
    where: { property: { equals: Prisma.DbNull }, address1: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let done = 0;
  for (const lead of pending) {
    const info = await lookupProperty(lead);
    await db.lead.update({ where: { id: lead.id }, data: { property: asJson(info) } });
    done++;
  }

  const remaining = await db.lead.count({
    where: { property: { equals: Prisma.DbNull }, address1: { not: null } },
  });

  revalidatePath("/leads");
  revalidatePath("/settings");
  return { done, remaining };
}

/** Pulls building permits for the lead's address and caches them. */
export async function refreshPermits(leadId: string, force = false): Promise<PermitInfo | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role !== "ADMIN" && lead.assignedToId !== user.id) {
    throw new Error("You can only work leads assigned to you");
  }

  const cached = readPermits(lead.permits);
  // A "not configured" result is worth retrying once a key is added.
  if (cached && !force && cached.status !== "NOT_CONFIGURED") return cached;
  if (!permitsConfigured()) return cached ?? null;

  const info = await lookupPermits(lead);
  await db.lead.update({
    where: { id: leadId },
    data: { permits: info as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/leads/${leadId}`);
  return info;
}

/**
 * Fire-and-forget lookup for a lead that just arrived from a webhook or import.
 * Never throws into the caller — a lead must save even if the roll is down.
 */
export async function lookupNewLead(leadId: string): Promise<void> {
  try {
    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (!lead || !lead.address1) return;
    const info = await lookupProperty(lead);
    await db.lead.update({ where: { id: leadId }, data: { property: asJson(info) } });

    if (permitsConfigured()) {
      const permits = await lookupPermits(lead);
      await db.lead.update({
        where: { id: leadId },
        data: { permits: permits as unknown as Prisma.InputJsonValue },
      });
    }
  } catch (err) {
    console.error("[property] background lookup failed", leadId, err);
  }
}
