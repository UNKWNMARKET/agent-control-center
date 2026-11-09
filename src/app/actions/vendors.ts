"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import type { ActionState } from "./users";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (user.role !== "ADMIN") throw new Error("Admins only");
  return user;
}

function newToken(): string {
  return `whk_${randomBytes(20).toString("hex")}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createVendor(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminUser();

  const parsed = z
    .object({ name: z.string().min(1, "Name is required.").trim() })
    .safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const base = slugify(parsed.data.name) || "vendor";
  let slug = base;
  let i = 1;
  while (await db.vendor.findFirst({ where: { slug } })) {
    slug = `${base}-${i++}`;
  }

  await db.vendor.create({
    data: { name: parsed.data.name, slug, webhookToken: newToken() },
  });

  revalidatePath("/vendors");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function toggleVendorActive(vendorId: string): Promise<void> {
  await requireAdminUser();
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor not found");
  await db.vendor.update({
    where: { id: vendorId },
    data: { active: !vendor.active },
  });
  revalidatePath("/vendors");
}

export async function regenerateVendorToken(vendorId: string): Promise<void> {
  await requireAdminUser();
  await db.vendor.update({
    where: { id: vendorId },
    data: { webhookToken: newToken() },
  });
  revalidatePath("/vendors");
}

export async function deleteVendor(vendorId: string): Promise<void> {
  await requireAdminUser();
  await db.vendor.delete({ where: { id: vendorId } });
  revalidatePath("/vendors");
}

export async function updateVendorCost(
  vendorId: string,
  cost: number | null,
): Promise<void> {
  await requireAdminUser();
  await db.vendor.update({
    where: { id: vendorId },
    data: { costPerLead: cost != null && !Number.isNaN(cost) ? cost : null },
  });
  revalidatePath("/vendors");
  revalidatePath("/reports");
}
