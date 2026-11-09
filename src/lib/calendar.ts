/**
 * Calendar invites for follow-ups.
 *
 * Outlook (desktop, web and mobile) reads standard iCalendar, so a follow-up
 * becomes a real appointment with a reminder — no Microsoft app registration
 * and no per-agent sign-in.
 *
 * Times are written "floating" (no timezone, no Z): 9:00 AM means 9:00 AM on
 * whatever machine opens it. Everyone here is in one timezone, and it avoids
 * shipping a VTIMEZONE block that clients disagree about.
 */

export type FollowUpEvent = {
  uid: string;
  /** Calendar date of the follow-up (midnight UTC as stored). */
  date: Date;
  leadName: string;
  leadUrl: string;
  phone?: string | null;
  notes?: string | null;
  /** Agent the reminder belongs to. */
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  organizerEmail?: string | null;
  /** REQUEST turns it into an invite Outlook will add; PUBLISH is for a download. */
  method?: "REQUEST" | "PUBLISH";
  /** Local start hour, 24h. */
  hour?: number;
  /** Minutes before the event to pop the reminder. */
  reminderMinutes?: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Folds long lines at 75 octets, as iCalendar requires. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    parts.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  if (rest) parts.push(" " + rest);
  return parts.join("\r\n");
}

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Floating local time on the follow-up's calendar date. */
const localAt = (date: Date, hour: number, minutes = 0) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(hour)}${pad(minutes)}00`;

export function buildFollowUpIcs(e: FollowUpEvent): string {
  const hour = e.hour ?? 9;
  const reminder = e.reminderMinutes ?? 30;
  const method = e.method ?? "PUBLISH";

  const summary = `Follow up: ${e.leadName}`;
  const description = [
    `Follow up with ${e.leadName}.`,
    e.phone ? `Phone: ${e.phone}` : null,
    e.notes ? `Notes: ${e.notes}` : null,
    `Open the lead: ${e.leadUrl}`,
  ].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Agent Control Center//Follow-up//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${localAt(e.date, hour)}`,
    `DTEND:${localAt(e.date, hour, 30)}`,
    fold(`SUMMARY:${esc(summary)}`),
    fold(`DESCRIPTION:${esc(description)}`),
    fold(`URL:${e.leadUrl}`),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "SEQUENCE:0",
    "PRIORITY:5",
  ];

  if (method === "REQUEST" && e.organizerEmail) {
    lines.push(fold(`ORGANIZER;CN=Agent Control Center:mailto:${e.organizerEmail}`));
  }
  if (method === "REQUEST" && e.attendeeEmail) {
    lines.push(
      fold(
        `ATTENDEE;CN=${esc(e.attendeeName || e.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${e.attendeeEmail}`,
      ),
    );
  }

  lines.push(
    "BEGIN:VALARM",
    `TRIGGER:-PT${reminder}M`,
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${esc(summary)}`),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.join("\r\n") + "\r\n";
}

/** Stable per lead, so re-saving a follow-up updates the same appointment. */
export const followUpUid = (leadId: string) => `followup-${leadId}@lead-management`;
