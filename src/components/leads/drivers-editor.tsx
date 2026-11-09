"use client";

import { useState } from "react";
import { Plus, X, Users } from "lucide-react";
import { emptyDriver, RELATIONSHIPS, type Driver } from "@/lib/drivers";

/**
 * Listed drivers. Rides along with the surrounding form as one JSON field, the
 * same way vehicles do, so the existing save button covers it.
 */
export function DriversEditor({ initial }: { initial: Driver[] }) {
  const [rows, setRows] = useState<Driver[]>(initial.length ? initial : [emptyDriver()]);

  const update = (i: number, key: keyof Driver, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const add = () => setRows((prev) => [...prev, emptyDriver()]);

  const remove = (i: number) =>
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [emptyDriver()];
    });

  const filled = rows.filter((r) => r.name || r.dob || r.license).length;

  return (
    <div>
      <input type="hidden" name="drivers" value={JSON.stringify(rows)} />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        <Users size={15} />
        Listed drivers
        {filled > 0 ? <span className="text-faint">· {filled}</span> : null}
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input
              value={row.name}
              onChange={(e) => update(i, "name", e.target.value)}
              placeholder="Full name"
              aria-label={`Driver ${i + 1} name`}
              className="input min-w-0 flex-1"
            />
            <input
              value={row.dob}
              onChange={(e) => update(i, "dob", e.target.value)}
              placeholder="DOB"
              aria-label={`Driver ${i + 1} date of birth`}
              className="input w-[120px] shrink-0"
            />
            <input
              value={row.license}
              onChange={(e) => update(i, "license", e.target.value.toUpperCase())}
              placeholder="License #"
              aria-label={`Driver ${i + 1} license number`}
              className="input min-w-0 flex-1 font-mono text-xs uppercase"
            />
            <select
              value={row.relationship}
              onChange={(e) => update(i, "relationship", e.target.value)}
              aria-label={`Driver ${i + 1} relationship`}
              className="input w-[110px] shrink-0"
            >
              <option value="">—</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove driver ${i + 1}`}
              className="shrink-0 rounded-lg p-2 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className="btn btn-secondary mt-3 py-1.5">
        <Plus size={15} /> Add driver
      </button>
    </div>
  );
}
