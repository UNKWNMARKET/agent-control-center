"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  if (user.role !== "ADMIN") throw new Error("Admins only");
  return user;
}

const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required.").trim(),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["ADMIN", "AGENT"]),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminUser();

  const parsed = CreateUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "A user with that email already exists." };

  await db.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role as Role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  revalidatePath("/team");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function setUserRole(userId: string, role: Role): Promise<void> {
  const admin = await requireAdminUser();
  if (userId === admin.id && role !== "ADMIN") {
    throw new Error("You can't remove your own admin access.");
  }
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/team");
}

export async function toggleUserActive(userId: string): Promise<void> {
  const admin = await requireAdminUser();
  if (userId === admin.id) throw new Error("You can't deactivate yourself.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  await db.user.update({
    where: { id: userId },
    data: { active: !user.active },
  });
  revalidatePath("/team");
}

export async function resetUserPassword(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdminUser();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  return { ok: true, message: "Password updated." };
}

export async function quickResetPassword(
  userId: string,
  password: string,
): Promise<void> {
  await requireAdminUser();
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });
  revalidatePath("/team");
}

export async function setUserGoal(
  userId: string,
  goal: number | null,
): Promise<void> {
  await requireAdminUser();
  await db.user.update({
    where: { id: userId },
    data: { monthlyGoal: goal != null && goal >= 0 ? Math.floor(goal) : null },
  });
  revalidatePath("/team");
  revalidatePath("/reports");
}

export async function deleteUser(userId: string): Promise<void> {
  const admin = await requireAdminUser();
  if (userId === admin.id) throw new Error("You can't delete yourself.");
  // Their assigned leads become unassigned (FK onDelete: SetNull).
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/team");
  revalidatePath("/leads");
}

const ChangePasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    password: z.string().min(8, "New password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "New passwords do not match.",
    path: ["confirm"],
  });

export async function changeOwnPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const parsed = ChangePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const ok = await verifyPassword(parsed.data.current, user.passwordHash);
  if (!ok) return { error: "Your current password is incorrect." };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  return { ok: true, message: "Password changed." };
}
