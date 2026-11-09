"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";

const FILL_FIELDS = [
  "firstName", "lastName", "email", "phone", "phoneSecondary", "address1",
  "address2", "city", "state", "zip", "dob", "maritalStatus", "product", "premium",
] as const;

/** Merge duplicate leads into one primary: keep its activities + the others',
 *  backfill any blank fields, then delete the duplicates. */
export async function mergeLeads(
  primaryId: string,
  allIds: string[],
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (user.role !== "ADMIN") throw new Error("Admins only");

  const ids = allIds.filter((id) => id !== primaryId);
  if (ids.length === 0) return;

  const primary = await db.lead.findUnique({ where: { id: primaryId } });
  if (!primary) throw new Error("Primary lead not found");
  const dupes = await db.lead.findMany({ where: { id: { in: ids } } });

  // Backfill any blank field on the primary from a duplicate.
  const pr = primary as unknown as Record<string, unknown>;
  const fill: Record<string, unknown> = {};
  for (const d of dupes) {
    const dr = d as unknown as Record<string, unknown>;
    for (const f of FILL_FIELDS) {
      if (!pr[f] && !fill[f] && dr[f]) fill[f] = dr[f];
    }
  }

  // Move the duplicates' activity history onto the primary before deleting them.
  await db.activity.updateMany({
    where: { leadId: { in: ids } },
    data: { leadId: primaryId },
  });
  await db.activity.create({
    data: {
      leadId: primaryId,
      userId: user.id,
      type: "NOTE",
      body: `Merged ${ids.length} duplicate lead${ids.length > 1 ? "s" : ""} by ${user.name}`,
    },
  });
  if (Object.keys(fill).length) {
    await db.lead.update({
      where: { id: primaryId },
      data: fill as Prisma.LeadUpdateInput,
    });
  }
  await db.lead.deleteMany({ where: { id: { in: ids } } });

  revalidatePath("/duplicates");
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}
