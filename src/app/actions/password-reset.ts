"use server";

import { randomBytes, createHash } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { unscopedDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { sendEmail, passwordResetEmail } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export type ResetState =
  | { ok?: boolean; error?: string; message?: string }
  | undefined;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Step 1 — user submits their email to request a reset link. */
export async function requestPasswordReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address." };
  }

  const user = await unscopedDb.user.findUnique({ where: { email } });

  // Only act for real, active accounts — but always return the same message
  // so the form can't be used to discover which emails have accounts.
  if (user && user.active) {
    await unscopedDb.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const raw = randomBytes(32).toString("base64url");
    await unscopedDb.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL || "";
    const link = `${base}/reset-password?token=${raw}`;
    const { subject, html } = passwordResetEmail(user.name, link);
    const sent = await sendEmail({ to: user.email, subject, html });
    if (!sent) {
      // Email provider not configured yet — surface the link in server logs
      // so an admin can complete the reset during setup.
      console.warn(`[reset] Email not sent. Reset link for ${user.email}: ${link}`);
    }
  }

  return {
    ok: true,
    message:
      "If an account exists for that email, a password reset link is on its way.",
  };
}

const ResetSchema = z
  .object({
    token: z.string().min(1, "Missing reset token."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

/** Step 2 — user submits a new password using the token from the email link. */
export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = ResetSchema.safeParse({
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const record = await unscopedDb.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return {
      error: "This reset link is invalid or has expired. Please request a new one.",
    };
  }

  await unscopedDb.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  // Invalidate all of this user's tokens.
  await unscopedDb.passwordResetToken.deleteMany({ where: { userId: record.userId } });

  redirect("/login?reset=1");
}
