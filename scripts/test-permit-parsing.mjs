/**
 * Checks how permit records are read and which ones count as roofing.
 *
 *   node scripts/test-permit-parsing.mjs
 *
 * This exercises OUR parsing against permit objects shaped the way the Shovels
 * API documents them. It does NOT prove the live API returns this shape, or
 * that the permit data itself is correct — only a real API key can show that.
 */
import { toPermit } from "../src/lib/permits.ts";

const cases = [
  // [label, raw permit, should be roofing?]
  ["roof tag", { number: "R-1", issue_date: "2019-04-02", tags: ["roofing"], description: "Replace covering", job_value: 1850000, status: "final" }, true],
  ["reroof text", { number: "R-2", issue_date: "2021-08-11", description: "RE-ROOF SINGLE FAMILY", job_value: 2240000, status: "final" }, true],
  ["shingles", { number: "R-3", file_date: "2016-02-20", description: "Tear off and install shingles", status: "final" }, true],
  ["tile roof", { number: "R-4", issue_date: "2014-06-01", type: "Tile Roof Replacement", status: "final" }, true],
  ["roof in type", { number: "R-5", issue_date: "2023-01-09", type: "ROOFING", description: null, status: "active" }, true],
  ["truss repair", { number: "R-6", issue_date: "2012-05-05", description: "Truss repair after storm", status: "final" }, true],
  ["hvac", { number: "N-1", issue_date: "2020-03-03", description: "A/C changeout 3 ton", job_value: 780000, status: "final" }, false],
  ["pool", { number: "N-2", issue_date: "2018-07-19", description: "Install in-ground pool", job_value: 5500000, status: "final" }, false],
  ["water heater", { number: "N-3", issue_date: "2022-11-30", description: "Water heater replacement", status: "final" }, false],
  ["solar", { number: "N-4", issue_date: "2024-05-15", description: "Rooftop solar PV array", status: "active" }, true], // mentions roof — flagged on purpose
];

let failures = 0;
console.log("label           roof?  expected  date        value      description");
for (const [label, raw, expected] of cases) {
  const p = toPermit(raw);
  const ok = p.isRoof === expected;
  if (!ok) failures++;
  console.log(
    `${label.padEnd(15)} ${String(p.isRoof).padEnd(6)} ${String(expected).padEnd(9)} ${(p.date ?? "—").padEnd(11)} ${(p.jobValue == null ? "—" : "$" + p.jobValue.toLocaleString("en-US")).padEnd(10)} ${p.description ?? p.type ?? "—"}${ok ? "" : "   <-- MISMATCH"}`,
  );
}

console.log(`\n${cases.length - failures}/${cases.length} classified as expected.`);
console.log("Note: solar is flagged as roofing on purpose — it is roof work an underwriter asks about.");
process.exit(failures === 0 ? 0 : 1);
