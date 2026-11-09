/**
 * Fills in the property record for every lead that has never been checked.
 *
 *   node --env-file=.env scripts/backfill-property.mjs
 *
 * Imports the app's own lookup so this can't drift from what the UI does.
 * Runs one lead at a time with a short pause — the Census geocoder and the
 * state parcel service are free, public, and shared.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { lookupProperty } from "../src/lib/property.ts";

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --force re-checks every lead, not just the ones never looked up.
const force = process.argv.includes("--force");

const leads = await prisma.lead.findMany({
  where: {
    address1: { not: null },
    ...(force ? {} : { property: { equals: Prisma.DbNull } }),
  },
  orderBy: { createdAt: "desc" },
});

console.log(`${leads.length} leads to check\n`);

const tally = {};
let n = 0;

for (const lead of leads) {
  const info = await lookupProperty(lead);
  await prisma.lead.update({ where: { id: lead.id }, data: { property: info } });

  tally[info.ownership] = (tally[info.ownership] ?? 0) + 1;
  n++;
  const who = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.id.slice(0, 8);
  console.log(
    `${String(n).padStart(3)}/${leads.length}  ${info.ownership.padEnd(14)} ${who.padEnd(26)} ${info.ownerName ?? ""}`,
  );
  await sleep(250);
}

console.log("\nDone.");
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${v}`);
}

await prisma.$disconnect();
