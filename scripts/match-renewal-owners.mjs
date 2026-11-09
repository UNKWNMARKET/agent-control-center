/**
 * Cross-references a renewal list (name + city/ZIP only, no street address)
 * against the Florida parcel roll, and imports the confirmed homeowners
 * split evenly between agents.
 *
 *   node --env-file=.env scripts/match-renewal-owners.mjs scripts/data/<file>.csv [--commit]
 *
 * Attribute queries on a 10.9M-parcel layer time out, so each ZIP's boundary
 * comes from the Census ZCTA layer, every parcel inside it is pulled through
 * the (fast, indexed) spatial query, and names are matched here.
 *
 * A client counts as a homeowner only when the deed carries BOTH their last
 * and first name on a residential parcel. Several different owners with the
 * same name means ambiguous, not confirmed — those are reported, not imported.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FILE = process.argv[2];
const COMMIT = process.argv.includes("--commit");
const SOURCE = "Auto renewal cross-sell";
const PARCELS = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";
const ZCTA = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/1/query";
const RESIDENTIAL = new Set(["001", "002", "003", "004", "005", "006", "007", "008"]);

const AGENTS = [
  { key: "ayat", id: "17b628fd-cb6c-4227-97f1-3f18f1713d58", name: "Ayat" },
  { key: "henry", id: "a37657bd-8569-43ed-965e-cc9246c058cc", name: "Henry Gonzalez" },
  { key: "jennifer", id: "d56668d1-bb94-45d5-9b72-21c26cc6bf9d", name: "Jennifer Reyes" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'’\-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

async function getJson(url, timeoutMs = 120_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message ?? "query error");
    return j;
  } finally { clearTimeout(t); }
}

/** Bounding box of a ZIP, from the Census ZCTA layer. */
const zipBoxCache = new Map();
async function zipBox(zip) {
  if (zipBoxCache.has(zip)) return zipBoxCache.get(zip);
  const url = `${ZCTA}?where=${encodeURIComponent(`ZCTA5='${zip}'`)}&outFields=ZCTA5,CENTLAT,CENTLON,AREALAND&returnGeometry=true&outSR=4326&f=json`;
  let box = null;
  try {
    const j = await getJson(url, 60_000);
    const f = j.features?.[0];
    if (f?.geometry?.rings) {
      let xmin = 180, ymin = 90, xmax = -180, ymax = -90;
      for (const ring of f.geometry.rings) for (const [x, y] of ring) {
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
      box = { xmin, ymin, xmax, ymax };
    }
  } catch (e) { console.error(`  zip ${zip}: boundary lookup failed (${e.message})`); }
  zipBoxCache.set(zip, box);
  return box;
}

/** Every residential parcel inside a ZIP, paged. */
const parcelCache = new Map();
async function parcelsInZip(zip) {
  if (parcelCache.has(zip)) return parcelCache.get(zip);
  const box = await zipBox(zip);
  if (!box) { parcelCache.set(zip, []); return []; }

  const geometry = `${box.xmin},${box.ymin},${box.xmax},${box.ymax}`;
  const out = [];
  for (let offset = 0; offset < 20000; offset += 2000) {
    const params = new URLSearchParams({
      where: "1=1",
      geometry, geometryType: "esriGeometryEnvelope", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "OWN_NAME,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,JV,JV_HMSTD,ACT_YR_BLT,TOT_LVG_AR,DOR_UC",
      returnGeometry: "false", resultRecordCount: "2000", resultOffset: String(offset), f: "json",
    });
    let page;
    try { page = await getJson(`${PARCELS}?${params}`); }
    catch (e) { console.error(`  zip ${zip}: parcel page at ${offset} failed (${e.message})`); break; }
    const items = (page.features ?? []).map((f) => f.attributes);
    out.push(...items.filter((a) => RESIDENTIAL.has(String(a.DOR_UC ?? "").padStart(3, "0"))));
    if (items.length < 2000) break;
    await sleep(120);
  }
  parcelCache.set(zip, out);
  return out;
}

/** Deed must carry the last name AND the first name. */
function matchOwners(parcels, last, first, zip) {
  const L = norm(last), F = norm(first).split(" ")[0];
  return parcels.filter((p) => {
    const words = new Set(norm(p.OWN_NAME).split(" "));
    if (!L.split(" ").some((w) => w.length > 1 && words.has(w))) return false;
    return F.length > 1 && (words.has(F) || words.has(F[0]));
  }).map((p) => ({ ...p, sameZip: String(p.PHY_ZIPCD ?? "").slice(0, 5) === zip }));
}

// ---- run ----------------------------------------------------------------
const rows = fs.readFileSync(FILE, "utf8").trim().split(/\r?\n/).slice(1).map((line) => {
  const m = line.match(/^([^,]*),\s*"([^"]*)",([^,]*),([^,]*),(.*)$/);
  if (!m) return null;
  const [, policy, name, city, state, zip] = m;
  const [last, first] = name.includes(",") ? name.split(",", 2).map((s) => s.trim()) : ["", name];
  return { policy: policy.trim(), last, first, city: city.trim(), state: state.trim(), zip: zip.trim() };
}).filter(Boolean);

console.log(`${rows.length} renewal clients to check\n`);

const results = [];
for (const [i, c] of rows.entries()) {
  if (!/^3[2-4]\d{3}$/.test(c.zip)) {
    console.log(`${String(i + 1).padStart(2)}/${rows.length}  SKIP        ${c.first} ${c.last} — ZIP ${c.zip} is not a Florida ZIP`);
    results.push({ ...c, verdict: "NOT_FL" });
    continue;
  }
  const parcels = await parcelsInZip(c.zip);
  const hits = matchOwners(parcels, c.last, c.first, c.zip);
  const best = hits.filter((h) => h.sameZip);
  const use = best.length ? best : hits;
  const addresses = new Set(use.map((h) => h.PHY_ADDR1));

  let verdict = "NONE";
  if (addresses.size === 1) verdict = "OWNER";
  else if (addresses.size > 1) verdict = "AMBIGUOUS";

  results.push({ ...c, verdict, parcel: use[0] ?? null, candidates: use.length, parcelCount: parcels.length });
  console.log(
    `${String(i + 1).padStart(2)}/${rows.length}  ${verdict.padEnd(10)}  ${(c.first + " " + c.last).padEnd(26)} ${use[0]?.PHY_ADDR1 ?? ""}  ${use[0] ? `(${use[0].OWN_NAME})` : `[${parcels.length} parcels in zip]`}`,
  );
}

const owners = results.filter((r) => r.verdict === "OWNER");
console.log(`\nConfirmed homeowners: ${owners.length}`);
console.log(`Ambiguous (same name, several properties): ${results.filter((r) => r.verdict === "AMBIGUOUS").length}`);
console.log(`No match (likely renters): ${results.filter((r) => r.verdict === "NONE").length}`);
console.log(`Skipped (not a Florida ZIP): ${results.filter((r) => r.verdict === "NOT_FL").length}`);

if (!COMMIT) {
  console.log("\nDRY RUN — nothing written. Re-run with --commit to import the confirmed homeowners.");
  await prisma.$disconnect();
  process.exit(0);
}

const existing = await prisma.lead.findMany({ select: { externalId: true, firstName: true, lastName: true } });
const ids = new Set(existing.map((l) => l.externalId).filter(Boolean));
const names = new Set(existing.map((l) => `${(l.firstName ?? "").toLowerCase()} ${(l.lastName ?? "").toLowerCase()}`.trim()));

let n = 0, created = 0;
for (const r of owners) {
  const firstName = titleCase(r.first), lastName = titleCase(r.last);
  if (ids.has(r.policy) || names.has(`${firstName} ${lastName}`.toLowerCase())) continue;
  const agent = AGENTS[n++ % AGENTS.length];
  const p = r.parcel;
  const homestead = Number(p.JV_HMSTD ?? 0) > 0;
  await prisma.lead.create({
    data: {
      firstName, lastName,
      address1: p.PHY_ADDR1 ?? null,
      city: titleCase(p.PHY_CITY ?? r.city),
      state: "FL",
      zip: String(p.PHY_ZIPCD ?? r.zip).slice(0, 5),
      product: "Home",
      source: SOURCE,
      externalId: r.policy,
      assignedToId: agent.id,
      tags: ["cross-sell", "homeowner", "dec-renewal"],
      notes: `December auto renewal (policy ${r.policy}) confirmed as a property owner. ${p.PHY_ADDR1}, ${titleCase(p.PHY_CITY ?? "")} — owner of record ${p.OWN_NAME}. Homestead: ${homestead ? "Yes" : "No"}. Just value $${Number(p.JV ?? 0).toLocaleString("en-US")}, built ${p.ACT_YR_BLT || "—"}, ${p.TOT_LVG_AR || "—"} sq ft.`,
      property: {
        ownership: "OWNER", homestead,
        ownerName: p.OWN_NAME ?? null,
        parcelAddress: `${p.PHY_ADDR1}, ${titleCase(p.PHY_CITY ?? "")}`,
        justValue: Number(p.JV) || null, homesteadValue: Number(p.JV_HMSTD) || null,
        yearBuilt: Number(p.ACT_YR_BLT) || null, effectiveYear: null,
        livingArea: Number(p.TOT_LVG_AR) || null, saleYear: null, salePrice: null,
        checkedAt: new Date().toISOString(),
        note: "Matched by owner name within the client's ZIP on the 2025 DOR parcel roll.",
      },
      activities: { create: { type: "IMPORTED", body: `December renewal list — confirmed homeowner, assigned to ${agent.name}` } },
    },
  });
  created++;
}
console.log(`\nCreated ${created} leads, split across ${AGENTS.map((a) => a.name).join(", ")}.`);
await prisma.$disconnect();
