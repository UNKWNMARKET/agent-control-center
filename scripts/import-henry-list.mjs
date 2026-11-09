/**
 * Imports the auto-renewal owner cross-reference as cross-sell leads.
 *
 *   node --env-file=.env scripts/import-henry-list.mjs "<file.xlsx>" [--commit]
 *
 * Without --commit it only prints what it would create.
 *
 * Homeowners  -> confirmed owner, property address used as the risk address
 * Verify      -> ownership unconfirmed, candidate parcels listed in the notes
 *                and NO address set, so nobody quotes the wrong house
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
const who = (process.argv.find((a) => a.startsWith("--agent=")) ?? "--agent=henry").split("=")[1];
const AGENT = AGENTS[who];
if (!AGENT) { console.error(`Unknown agent "${who}". Use one of: ${Object.keys(AGENTS).join(", ")}`); process.exit(1); }
const HENRY = AGENT.id;

/** --sheets=homeowners,verify  (default: both) */
const sheetArg = (process.argv.find((a) => a.startsWith("--sheets=")) ?? "--sheets=homeowners,verify").split("=")[1];
const WANT = new Set(sheetArg.split(",").map((s) => s.trim().toLowerCase()));

const cell = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v).trim();
};

/** "Safety Harbor, FL 34695-4107" -> city, state, 5-digit zip */
function parsePolicyCity(s) {
  const m = s.match(/^(.*?),\s*([A-Z]{2})\s*(\d{5})/);
  return m ? { city: m[1].trim(), state: m[2], zip: m[3] } : { city: "", state: "FL", zip: "" };
}

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

const num = (s) => { const n = Number(String(s).replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

function sheetRows(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const v = row.values.slice(1).map(cell);
    if (v.some((x) => x !== "")) rows.push(v);
  });
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(FILE);
const homeowners = WANT.has("homeowners") ? sheetRows(wb.getWorksheet("Homeowners")) : [];
const verify = WANT.has("verify") ? sheetRows(wb.getWorksheet("Verify")) : [];

/** One lead per client; a client with several candidate parcels keeps them all in the notes. */
const byClient = new Map();

for (const r of homeowners) {
  const key = `${r["Policy #"]}|${r["Client"]}`.toLowerCase();
  const existing = byClient.get(key);
  const detail = `${r["Property Address"]}, ${r["City"]} ${r["ZIP"]} (${r["County"]} County) — ${r["Property Type"]}, homestead ${r["Homestead"]}, just value $${Number(num(r["Just (Market) Value"]) ?? 0).toLocaleString("en-US")}, built ${r["Year Built"]}, ${r["Living Sq Ft"]} sq ft. Owner of record: ${r["Owner of Record"]}. Parcel ${r["Parcel ID"]}.`;
  if (existing) { existing.extra.push(detail); continue; }
  byClient.set(key, {
    kind: "owner", row: r, extra: [],
    lead: {
      ...splitName(r["Client"]),
      address1: r["Property Address"] || null,
      city: r["City"] || null,
      state: "FL",
      zip: r["ZIP"] || null,
      product: "Home",
      source: SOURCE,
      externalId: r["Policy #"] || null,
      assignedToId: HENRY,
      tags: ["cross-sell", "homeowner"],
      notes: `Auto client (policy ${r["Policy #"]}) confirmed as a property owner. ${detail}`,
      property: {
        ownership: "OWNER",
        homestead: String(r["Homestead"]).toLowerCase() === "yes",
        ownerName: r["Owner of Record"] || null,
        parcelAddress: `${r["Property Address"]}, ${r["City"]}`,
        justValue: num(r["Just (Market) Value"]),
        homesteadValue: null,
        yearBuilt: num(r["Year Built"]),
        effectiveYear: null,
        livingArea: num(r["Living Sq Ft"]),
        saleYear: null,
        salePrice: null,
        checkedAt: new Date().toISOString(),
        note: `From the auto renewal owner cross-reference (2025 DOR roll). Match confidence: ${r["Match Confidence"] || "—"}.`,
      },
    },
  });
}

for (const r of verify) {
  const key = `${r["Policy #"]}|${r["Client"]}`.toLowerCase();
  const candidate = `${r["Owner of Record"]} — ${r["Property Address"]}, ${r["City"]} ${r["ZIP"]} (${r["County"]} County), ${r["Property Type"]}, homestead ${r["Homestead"]}, parcel ${r["Parcel ID"]}`;
  const existing = byClient.get(key);
  if (existing) { existing.extra.push(candidate); continue; }
  const pc = parsePolicyCity(r["Policy City / ZIP"]);
  byClient.set(key, {
    kind: "verify", row: r, extra: [],
    lead: {
      ...splitName(r["Client"]),
      address1: null, // unconfirmed — don't quote a house we haven't verified
      city: pc.city || null,
      state: pc.state,
      zip: pc.zip || null,
      product: "Home",
      source: SOURCE,
      externalId: r["Policy #"] || null,
      assignedToId: HENRY,
      tags: ["cross-sell", "verify-owner"],
      notes: `Auto client (policy ${r["Policy #"]}) — ownership NOT confirmed. ${r["Why it needs a look"]} Candidate parcels: ${candidate}`,
      property: {
        ownership: "UNCERTAIN",
        homestead: String(r["Homestead"]).toLowerCase() === "yes",
        ownerName: r["Owner of Record"] || null,
        parcelAddress: `${r["Property Address"]}, ${r["City"]}`,
        justValue: null, homesteadValue: null, yearBuilt: null, effectiveYear: null,
        livingArea: null, saleYear: null, salePrice: null,
        checkedAt: new Date().toISOString(),
        note: `Needs a look: ${r["Why it needs a look"]}`,
      },
    },
  });
}

const planned = [...byClient.values()];
for (const p of planned) {
  if (p.extra.length) p.lead.notes += `\n\nOther parcels found: ${p.extra.join(" | ")}`;
}

// Don't create a second copy of someone already in the system.
const existingLeads = await prisma.lead.findMany({ select: { firstName: true, lastName: true, externalId: true } });
const seen = new Set(existingLeads.map((l) => `${(l.firstName ?? "").toLowerCase()} ${(l.lastName ?? "").toLowerCase()}`.trim()));
const seenIds = new Set(existingLeads.map((l) => l.externalId).filter(Boolean));

const toCreate = planned.filter((p) => {
  const nameKey = `${p.lead.firstName} ${p.lead.lastName}`.toLowerCase().trim();
  return !seen.has(nameKey) && !seenIds.has(p.lead.externalId);
});
const skipped = planned.length - toCreate.length;

console.log(`Homeowners sheet rows: ${homeowners.length}`);
console.log(`Verify sheet rows:     ${verify.length}`);
console.log(`Unique clients:        ${planned.length}  (owners ${planned.filter((p) => p.kind === "owner").length}, verify ${planned.filter((p) => p.kind === "verify").length})`);
console.log(`Already in the system: ${skipped}`);
console.log(`Would create:          ${toCreate.length}\n`);

for (const p of toCreate.slice(0, 5)) {
  console.log(`  ${p.lead.firstName} ${p.lead.lastName} | ${p.lead.address1 ?? "(no address — unverified)"} | ${p.lead.city} ${p.lead.zip} | policy ${p.lead.externalId} | ${p.lead.tags.join(",")}`);
}
if (toCreate.length > 5) console.log(`  … ${toCreate.length - 5} more`);

if (!COMMIT) {
  console.log("\nDRY RUN — nothing written. Re-run with --commit to import.");
  await prisma.$disconnect();
  process.exit(0);
}

let created = 0;
for (const p of toCreate) {
  const { property, tags, ...rest } = p.lead;
  await prisma.lead.create({
    data: {
      ...rest,
      tags,
      property,
      activities: {
        create: { type: "IMPORTED", body: `Imported from the auto renewal owner cross-reference and assigned to ${AGENT.name}` },
      },
    },
  });
  created++;
}
console.log(`\nCreated ${created} leads assigned to ${AGENT.name}.`);
await prisma.$disconnect();
