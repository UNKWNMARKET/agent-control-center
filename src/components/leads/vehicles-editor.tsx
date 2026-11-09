"use client";

import { useState } from "react";
import { Plus, X, Car } from "lucide-react";
import { emptyVehicle, type Vehicle } from "@/lib/vehicles";

/**
 * Listed vehicles on a lead. Rows live in component state and ride along with
 * the surrounding form as one JSON field, so the existing save button covers it.
 */
export function VehiclesEditor({
  initial,
  fromVendor,
}: {
  initial: Vehicle[];
  /** True when these came off the vendor payload and have never been saved. */
  fromVendor?: boolean;
}) {
  const [rows, setRows] = useState<Vehicle[]>(initial.length ? initial : [emptyVehicle()]);

  const update = (i: number, key: keyof Vehicle, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const add = () => setRows((prev) => [...prev, emptyVehicle()]);

  const remove = (i: number) =>
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [emptyVehicle()];
    });

  const filled = rows.filter((r) => r.year || r.make || r.model || r.vin).length;

  return (
    <div>
      <input type="hidden" name="vehicles" value={JSON.stringify(rows)} />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        <Car size={15} />
        Listed vehicles
        {filled > 0 ? <span className="text-faint">· {filled}</span> : null}
        {fromVendor ? (
          <span className="rounded bg-info-soft px-1.5 py-0.5 text-[0.65rem] font-medium normal-case tracking-normal text-info">
            From the lead source — save to keep
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input
              value={row.year}
              onChange={(e) => update(i, "year", e.target.value)}
              placeholder="Year"
              inputMode="numeric"
              maxLength={4}
              aria-label={`Vehicle ${i + 1} year`}
              className="input w-[72px] shrink-0"
            />
            <input
              value={row.make}
              onChange={(e) => update(i, "make", e.target.value)}
              placeholder="Make"
              aria-label={`Vehicle ${i + 1} make`}
              className="input min-w-0 flex-1"
            />
            <input
              value={row.model}
              onChange={(e) => update(i, "model", e.target.value)}
              placeholder="Model"
              aria-label={`Vehicle ${i + 1} model`}
              className="input min-w-0 flex-1"
            />
            <input
              value={row.vin}
              onChange={(e) => update(i, "vin", e.target.value.toUpperCase())}
              placeholder="VIN (optional)"
              maxLength={17}
              aria-label={`Vehicle ${i + 1} VIN`}
              className="input min-w-0 flex-1 font-mono text-xs uppercase"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove vehicle ${i + 1}`}
              className="shrink-0 rounded-lg p-2 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className="btn btn-secondary mt-3 py-1.5">
        <Plus size={15} /> Add vehicle
      </button>
    </div>
  );
}
