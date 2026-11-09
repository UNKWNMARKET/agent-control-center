/**
 * Imports a renewal cross-reference CSV as cross-sell leads for one agent.
 *
 *   node --env-file=.env scripts/import-renewal-csv.mjs "<file.csv>" --agent=ayat [--commit]
 *
 * Expects: Policy Number, Name ("LAST, FIRST"), Renewal City/State/Zip, County,
 * Confirmed Property Address, Homestead Exemption, Notes
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FILE = process.argv[2];
const COMMIT = process.argv.includes("--commit");
const SOURCE = "Auto renewal cross-sell";

const AGENTS = {
  henry: { id: "a37657bd-8569-43ed-965e-cc9246c058cc", name: "Henry Gonzalez" },
  jennifer: { id: "d56668d1-bb94-45d5-9b72-21c26cc6bf9d", name: "Jennifer Reyes" },
  ayat: { id: "17b628fd-cb6c-4227-97f1-3f18f1713d58", name: "Ayat" },
};
const who = (process.argv.find((a) => a.startsWith("--agent=")) ?? "").split("=")[1];
const AGENT = AGENTS[who];
if (!AGENT) { console.error(`Pass --agent= one of: ${Object.keys(AGENTS).join(", ")}`); process.exit(1); }

const titleCase = (s) =>
  s.toLowerCase().replace(/(^|[\s'’\-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

/** "RUYLE-KENNEDY, SERENA" -> { firstName: "Serena", lastName: "Ruyle-Kennedy" } */
function parseName(raw) {
  const s = String(raw ?? "").trim();
  if (s.includes(",")) {
    const [last, first] = s.split(",", 2);
    return { firstName: titleCase((first ?? "").trim()), lastName: titleCase(last.trim()) };
  }
  const parts = s.split(/\s+/);
  return { firstName: titleCase(parts.slice(0, -1).join(" ")), lastName: titleCase(parts.at(-1) ?? "") };
}

/** "409 Brier Cliff Dr, Temple Terrace FL 33617-4221" -> parts */
function parseAddress(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { address1: null, city: null, state: "FL", zip: null };
  const m = s.match(/^(.*?),\s*(.*?)\s+([A-Z]{2})\s+(\d{5})/);
  if (m) return { address1: m[1].trim(), city: m[2].trim(), state: m[3], zip: m[4] };
  return { address1: s, city: null, state: "FL", zip: null };
}

const zipOf = (s) => (String(s ?? "").match(/(\d{5})/) ?? [])[1] ?? null;

const wb = new ExcelJS.Workbook();
await wb.csv.readFile(FILE);
const ws = wb.worksheets[0];

const rows = [];
ws.eachRow({ includeEmpty: false }, (r) => {
  const v = r.values.slice(1).map((x) => (x == null ? "" : typeof x === "object" ? String(x.text ?? x.result ?? "") : String(x).trim()));
  if (v.some((x) => x !== "")) rows.push(v);
});
const header = rows.shift().map((h) => h.trim());
const col = (r, name) => {
  const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  return i === -1 ? "" : (r[i] ?? "").trim();
};

const planned = rows.map((r) => {
  const policy = col(r, "Policy Number");
  const { firstName, lastName } = parseName(col(r, "Name"));
  const addr = parseAddress(col(r, "Confirmed Property Address"));
  const county = col(r, "County");
  const homestead = col(r, "Homestead Exemption").toLowerCase().startsWith("y");
  const note = col(r, "Notes");
  return {
    firstName, lastName,
    address1: addr.address1,
    city: addr.city,
    state: addr.state || "FL",
    zip: addr.zip ?? zipOf(col(r, "Renewal City/State/Zip")),
    product: "Home",
    source: SOURCE,
    externalId: policy || null,
    assignedToId: AGENT.id,
    tags: ["cross-sell", "homeowner"],
    notes: `Auto client (policy ${policy}) confirmed as a property owner. ${addr.address1 ?? ""}${county ? ` — ${county} County` : ""}. Homestead: ${homestead ? "Yes" : "No"}.${note ? ` ${note}` : ""}`,
    property: {
      ownership: "OWNER",
      homestead,
      ownerName: null,
      parcelAddress: col(r, "Confirmed Property Address") || null,
      justValue: null, homesteadValue: null, yearBuilt: null, effectiveYear: null,
      livingArea: null, saleYear: null, salePrice: null,
      checkedAt: new Date().toISOString(),
      note: note || "Confirmed homeowner from the renewal cross-reference.",
    },
  };
});

const existing = await prisma.lead.findMany({ select: { firstName: true, lastName: true, externalId: true } });
const names = new Set(existing.map((l) => `${(l.firstName ?? "").toLowerCase()} ${(l.lastName ?? "").toLowerCase()}`.trim()));
const ids = new Set(existing.map((l) => l.externalId).filter(Boolean));

const toCreate = planned.filter((p) => !names.has(`${p.firstName} ${p.lastName}`.toLowerCase().trim()) && !ids.has(p.externalId));

console.log(`Rows in file:          ${planned.length}`);
console.log(`Already in the system: ${planned.length - toCreate.length}`);
console.log(`Would create:          ${toCreate.length} for ${AGENT.name}\n`);
for (const p of toCreate) {
  console.log(`  ${p.firstName} ${p.lastName} | ${p.address1} | ${p.city} ${p.zip} | policy ${p.externalId} | homestead ${p.property.homestead ? "Y" : "N"}`);
}

if (!COMMIT) {
  console.log("\nDRY RUN — nothing written. Re-run with --commit to import.");
  await prisma.$disconnect();
  process.exit(0);
}

let created = 0;
for (const p of toCreate) {
  const { property, tags, ...rest } = p;
  await prisma.lead.create({
    data: {
      ...rest, tags, property,
      activities: { create: { type: "IMPORTED", body: `Imported from the renewal cross-reference and assigned to ${AGENT.name}` } },
    },
  });
  created++;
}
console.log(`\nCreated ${created} leads assigned to ${AGENT.name}.`);
await prisma.$disconnect();
