/** Prints the shape of a spreadsheet so a mapping can be agreed before import. */
import ExcelJS from "exceljs";

const cell = (v) => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v) return String(v.text);
    if ("result" in v) return String(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return String(v.hyperlink);
    return JSON.stringify(v);
  }
  return String(v);
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(process.argv[2]);

for (const ws of wb.worksheets) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values.slice(1).map(cell);
    if (vals.some((v) => v.trim() !== "")) rows.push(vals);
  });
  console.log(`\n=== SHEET "${ws.name}" — ${rows.length} non-empty rows ===`);
  rows.slice(0, ws.name === "Summary" ? 20 : 4).forEach((r, i) => {
    console.log(`  [${i}] ${JSON.stringify(r)}`);
  });
  if (rows.length > 4 && ws.name !== "Summary") console.log(`  … ${rows.length - 4} more`);
}
