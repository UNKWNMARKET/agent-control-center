"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { UploadCloud, FileSpreadsheet, CheckCircle2, X } from "lucide-react";
import { normalizeLead } from "@/lib/leads";
import { importLeads, type ImportResult } from "@/app/actions/leads";
import { fullName, formatPhone } from "@/lib/utils";

type Row = Record<string, unknown>;

export function ImportClient({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  const usable = rows.filter((r) => {
    const n = normalizeLead(r);
    return n.firstName || n.lastName || n.phone || n.email;
  });

  function onFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const data = (res.data as Row[]).filter(
          (r) => r && Object.keys(r).length > 0,
        );
        setRows(data);
        setHeaders(res.meta.fields ?? []);
        if (data.length === 0) setError("No rows found in that file.");
      },
      error: () => setError("Could not read that file. Make sure it's a valid CSV."),
    });
  }

  function reset() {
    setFileName(null);
    setRows([]);
    setHeaders([]);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function doImport() {
    start(async () => {
      const res = await importLeads(vendorId, rows);
      setResult(res);
      router.refresh();
    });
  }

  if (result) {
    return (
      <div className="card flex flex-col items-center p-10 text-center">
        <CheckCircle2 size={44} className="text-positive" />
        <h2 className="mt-4 text-lg font-semibold text-ink">Import complete</h2>
        <p className="mt-1 text-sm text-muted">
          {result.imported} {result.imported === 1 ? "lead" : "leads"} imported
          {result.skipped > 0 ? ` · ${result.skipped} skipped (missing name/phone/email)` : ""}.
        </p>
        <div className="mt-6 flex gap-2">
          <button onClick={reset} className="btn btn-secondary">
            Import another file
          </button>
          <button onClick={() => router.push("/leads")} className="btn btn-primary">
            View leads
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <label
          className="card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-line-strong bg-surface-2 px-6 py-16 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <UploadCloud size={36} className="text-faint" />
          <p className="mt-3 text-[15px] font-semibold text-ink">
            Drop a CSV file here, or click to choose
          </p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Export your leads from EverQuote, AllWebLeads, Smart Financial, or any
            spreadsheet as CSV. Columns are detected automatically.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
      ) : (
        <>
          <div className="card flex items-center gap-3 p-4">
            <FileSpreadsheet size={22} className="text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{fileName}</p>
              <p className="text-xs text-muted">
                {rows.length} rows · {usable.length} importable · {headers.length} columns
              </p>
            </div>
            <button onClick={reset} className="rounded-full p-1.5 text-muted hover:bg-fill">
              <X size={18} />
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink">Preview</p>
              <p className="text-xs text-muted">
                Showing how the first rows map to lead fields.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase text-faint">
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">State</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map((r, i) => {
                    const n = normalizeLead(r);
                    return (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5 font-medium text-ink">{fullName(n)}</td>
                        <td className="px-4 py-2.5 text-ink-2">{formatPhone(n.phone)}</td>
                        <td className="px-4 py-2.5 text-ink-2">{n.email ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{n.product ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{n.state ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card flex flex-wrap items-end justify-between gap-4 p-4">
            <div>
              <label className="label">Lead source (optional)</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="input w-auto min-w-[200px]"
              >
                <option value="">No source / CSV import</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={doImport}
              disabled={pending || usable.length === 0}
              className="btn btn-primary"
            >
              {pending ? "Importing…" : `Import ${usable.length} leads`}
            </button>
          </div>
        </>
      )}

      {error ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
