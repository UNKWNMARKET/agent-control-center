/** Compares two cross-reference workbooks and hunts for any renewal-date column. */
import ExcelJS from "exceljs";

const cell = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return "text" in v ? String(v.text) : "result" in v ? String(v.result) : "";
  return String(v).trim();
};

async function load(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const out = {};
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const v = r.values.slice(1).map(cell);
      if (v.some((x) => x !== "")) rows.push(v);
    });
    out[ws.name] = rows;
  }
  return out;
}

const a = await load(process.argv[2]);
const b = await load(process.argv[3]);

for (const sheet of ["Homeowners", "Verify", "Not Found"]) {
  const ra = (a[sheet] ?? []).slice(1);
  const rb = (b[sheet] ?? []).slice(1);
  const keyOf = (r) => `${r[0]}|${r[1]}`.toLowerCase();
  const sa = new Set(ra.map(keyOf));
  const sb = new Set(rb.map(keyOf));
  const shared = [...sb].filter((k) => sa.has(k));
  console.log(`${sheet}: file A ${ra.length} rows, file B ${rb.length} rows, same policy+client in both: ${shared.length}`);
}

console.log("\nLooking for any renewal/expiration date column:");
for (const [name, rows] of Object.entries(b)) {
  if (!rows.length) continue;
  const header = rows[0];
  const hits = header.filter((h) => /renew|expir|x.?date|effective|term|due/i.test(h));
  console.log(`  ${name}: ${hits.length ? hits.join(", ") : "none"}`);
}

console.log("\nAny cell that looks like a 2026/2027 date:");
let found = 0;
for (const [name, rows] of Object.entries(b)) {
  for (const r of rows.slice(1)) {
    for (const v of r) {
      if (/20(26|27)-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/20(26|27)/.test(v)) {
        if (found++ < 5) console.log(`  ${name}: ${v}`);
      }
    }
  }
}
if (!found) console.log("  none");
