"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { unscopedDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, deleteSession } from "@/lib/session";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export type LoginState = { error?: string } | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { email, password } = parsed.data;
  const user = await unscopedDb.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !user.active) {
    return { error: "Incorrect email or password." };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { error: "Incorrect email or password." };
  }

  await createSession({ userId: user.id, role: user.role });

  const nextRaw = formData.get("next");
  const target =
    typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/dashboard";
  redirect(target);
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
