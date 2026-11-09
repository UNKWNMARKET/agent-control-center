/** Checks the generated calendar file against what Outlook requires. */
import { buildFollowUpIcs, followUpUid } from "../src/lib/calendar.ts";

const ics = buildFollowUpIcs({
  uid: followUpUid("abc-123"),
  date: new Date(Date.UTC(2026, 9, 20)),
  leadName: "Serena Ruyle-Kennedy",
  leadUrl: "https://www.floridainsurenow.com/leads/abc-123",
  phone: "(217) 555-0134",
  notes: "Wants bundle pricing before renewal; teen driver added in the fall, so quote both ways.",
  attendeeEmail: "hdgonzalez@acg.aaa.com",
  attendeeName: "Henry Gonzalez",
  organizerEmail: "noreply@floridainsurenow.com",
  method: "REQUEST",
});

console.log(ics.replace(/\r\n/g, "\n"));

// Long lines are folded with a leading space; unfold before matching content.
const flat = ics.replace(/\r\n[ \t]/g, "");

const checks = [
  ["CRLF line endings", /\r\n/.test(ics)],
  ["opens and closes VCALENDAR", ics.startsWith("BEGIN:VCALENDAR") && ics.trimEnd().endsWith("END:VCALENDAR")],
  ["has VEVENT", /BEGIN:VEVENT[\s\S]*END:VEVENT/.test(ics)],
  ["has reminder alarm", /BEGIN:VALARM[\s\S]*TRIGGER:-PT30M[\s\S]*END:VALARM/.test(ics)],
  ["start is 9am on the date", /DTSTART:20261020T090000/.test(ics)],
  ["end is 30 min later", /DTEND:20261020T093000/.test(ics)],
  ["stable UID", /UID:followup-abc-123@lead-management/.test(ics)],
  ["method REQUEST", /METHOD:REQUEST/.test(ics)],
  ["attendee present", /ATTENDEE[^\r\n]*hdgonzalez@acg\.aaa\.com/.test(flat)],
  ["organizer present", /ORGANIZER[^\r\n]*noreply@floridainsurenow\.com/.test(flat)],
  ["commas escaped in text", !/SUMMARY:[^\r\n]*[^\\],/.test(ics)],
  ["no line over 75 octets", ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75)],
];

let bad = 0;
console.log("---");
for (const [label, ok] of checks) {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
}
console.log(`\n${checks.length - bad}/${checks.length} checks passed.`);
process.exit(bad ? 1 : 0);
