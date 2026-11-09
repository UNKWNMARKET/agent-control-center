"use server";

import { redirect } from "next/navigation";
import { unscopedDb } from "@/lib/db";
import { hashInviteToken } from "@/lib/invites";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

/**
 * Accepting an invitation.
 *
 * Runs without a session — the whole point is that the person has no account
 * yet — so it uses the unscoped client and takes its agency from the
 * invitation, which was issued by someone who did have one.
 */

export type AcceptResult = { ok: boolean; message?: string };

/** What the page needs to greet someone, without giving anything away. */
export async function readInvite(token: string) {
  const invite = await unscopedDb.invite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { agency: { select: { name: true, status: true } } },
  });
  if (!invite) return null;
  if (invite.acceptedAt) return { state: "used" as const };
  if (invite.expiresAt < new Date()) return { state: "expired" as const };
  if (invite.agency.status !== "ACTIVE") return { state: "inactive" as const };
  return {
    state: "ok" as const,
    name: invite.name,
    email: invite.email,
    agencyName: invite.agency.name,
  };
}

export async function acceptInvite(token: string, formData: FormData): Promise<AcceptResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { ok: false, message: "Use at least 10 characters." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Those two passwords don't match." };
  }

  const tokenHash = hashInviteToken(token);
  const invite = await unscopedDb.invite.findUnique({
    where: { tokenHash },
    include: { agency: { select: { status: true } } },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { ok: false, message: "This invitation is no longer valid. Ask for a new one." };
  }
  if (invite.agency.status !== "ACTIVE") {
    return { ok: false, message: "That workspace isn't active. Speak to whoever invited you." };
  }

  // Between the invitation being sent and used, the address may have been
  // taken — by another agency, or by a second invitation.
  const taken = await unscopedDb.user.findUnique({ where: { email: invite.email } });
  if (taken) {
    return { ok: false, message: "There's already a login for that email address." };
  }

  const user = await unscopedDb.user.create({
    data: {
      agencyId: invite.agencyId,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      passwordHash: await hashPassword(password),
    },
  });

  // Burned, not deleted: the record of who was invited and when is worth
  // keeping, and a used token can never be replayed.
  await unscopedDb.invite.update({
    where: { tokenHash },
    data: { acceptedAt: new Date() },
  });

  await createSession({ userId: user.id, role: user.role });
  redirect("/dashboard");
}
