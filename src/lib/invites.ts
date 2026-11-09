import { randomBytes, createHash } from "crypto";

/**
 * Invitations, for standing up an agency and for bringing staff on.
 *
 * Only a hash of the token is kept. The raw token exists for the length of
 * one request — long enough to go into a link — and is never stored, so a
 * copy of the database is not a pile of working invitations.
 */

export const INVITE_TTL_DAYS = 14;

export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInviteToken(token) };
}

export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function inviteExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

/** The link that goes in the email. */
export function inviteUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return `${base}/accept-invite/${token}`;
}

/** A URL-safe handle for an agency, from its name. */
export function slugifyAgency(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agency"
  );
}
