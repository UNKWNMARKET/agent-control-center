/**
 * Checks the backup: that the CSV writer produces something Excel can read,
 * and that the tables it exports actually hold the book.
 *
 *   node --env-file=.env scripts/test-backup.mjs
 */
import { PrismaClient } from "@prisma/client";
import { toCsv, csvCell } from "../src/lib/csv.ts";

let bad = 0;
const check = (label, ok, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

// --- the writer ---------------------------------------------------------
const sample = toCsv([
  { name: 'Doyle, Jeffrey "JD"', note: "line one\nline two", premium: 1450, when: new Date(Date.UTC(2026, 9, 20)), vehicles: [{ make: "Jeep" }], missing: null },
]);
const [header, row] = sample.split("\r\n");

check("header lists every column", header === "name,note,premium,when,vehicles,missing", header);
check("commas and quotes are escaped", row.startsWith('"Doyle, Jeffrey ""JD"""'));
check("newlines stay inside one quoted cell", sample.split("\r\n").length === 2, `${sample.split("\r\n").length} lines`);
check("dates are ISO", row.includes("2026-10-20T00:00:00.000Z"));
check("objects become JSON, not [object Object]", row.includes('"[{""make"":""Jeep""}]"'));
check("nulls are empty, not the word null", row.endsWith(","));
check("empty input gives empty output", toCsv([]) === "");
check("plain values are unquoted", csvCell("Allstate") === "Allstate");

// --- the data it exports ------------------------------------------------
const prisma = new PrismaClient();
const [leads, policies, activities, users] = await Promise.all([
  prisma.lead.count(),
  prisma.policy.count(),
  prisma.activity.count(),
  prisma.user.count(),
]);
console.log(`\nbook: ${leads} people, ${policies} policies, ${activities} activity entries, ${users} team members`);
check("the book is non-trivial", leads > 100, `${leads} people`);
check("policies are included", policies > 0, `${policies}`);
check("history is included", activities > 100, `${activities} entries`);

await prisma.$disconnect();
console.log(`\n${bad === 0 ? "all checks passed" : `${bad} failed`}`);
process.exit(bad ? 1 : 0);
