/**
 * Builds "compose a new email" links for the agency's mail client.
 *
 * - `mailto` hands the address to whatever desktop client is registered,
 *   which on an agency PC with Outlook installed opens a new Outlook message.
 * - `office` / `live` open Outlook on the web, for machines without the
 *   desktop app. The two Outlook webmail hosts use different compose paths.
 */

export const MAIL_CLIENTS = {
  mailto: "Outlook desktop app",
  office: "Outlook on the web (work or school)",
  live: "Outlook.com (personal)",
} as const;

export type MailClient = keyof typeof MAIL_CLIENTS;

export const DEFAULT_MAIL_CLIENT: MailClient = "mailto";

export const MAIL_CLIENT_HINTS: Record<MailClient, string> = {
  mailto: "Opens a new message in the Outlook app installed on the agent's computer.",
  office: "Opens a compose window at outlook.office.com in a new browser tab.",
  live: "Opens a compose window at outlook.live.com in a new browser tab.",
};

export function asMailClient(value: string | null | undefined): MailClient {
  return value === "office" || value === "live" || value === "mailto"
    ? value
    : DEFAULT_MAIL_CLIENT;
}

/** True when the link should open in a new tab rather than hand off to the OS. */
export const opensInNewTab = (client: MailClient) => client !== "mailto";

export function composeHref(
  email: string | null | undefined,
  client: MailClient = DEFAULT_MAIL_CLIENT,
  opts: { subject?: string; body?: string } = {},
): string | null {
  const to = (email ?? "").trim();
  // Anything without an @ and a dotted domain is bad data from a lead vendor.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return null;

  const params = new URLSearchParams();
  if (opts.subject) params.set("subject", opts.subject);
  if (opts.body) params.set("body", opts.body);
  // URLSearchParams encodes spaces as "+", which mail clients show literally
  // in a mailto: subject. %20 is correct for mailto and fine for the web hosts.
  const qs = params.toString().replace(/\+/g, "%20");

  if (client === "office") {
    return `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}${qs ? `&${qs}` : ""}`;
  }
  if (client === "live") {
    return `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(to)}${qs ? `&${qs}` : ""}`;
  }
  return `mailto:${to}${qs ? `?${qs}` : ""}`;
}
