/**
 * CSV writing, kept free of imports so it can be exercised on its own.
 *
 * Excel is the consumer: quotes doubled, anything containing a comma, quote or
 * newline wrapped, CRLF line endings, objects flattened to JSON rather than
 * printing [object Object].
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
}

export function csvCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
