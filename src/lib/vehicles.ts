/**
 * Listed vehicles on a lead.
 *
 * Agents edit these by hand, but most leads arrive with vehicle data already
 * in the vendor's payload — in a different shape from every vendor:
 *   AllWebLeads       "Vehicles": "2008 JEEP COMMANDER; 2010 DODGE RAM 1500"
 *   Florida RateFinder "all_vehicles": ["2013 Nissan Altima"]
 *                      or flat "vehicle_year" / "vehicle_make" / "vehicle_model"
 *   Others            an array of objects with year/make/model keys
 * `vehiclesFromPayload` normalizes all of them so a lead shows its vehicles
 * before anyone types anything.
 */

export type Vehicle = {
  year: string;
  make: string;
  model: string;
  vin: string;
};

export const emptyVehicle = (): Vehicle => ({ year: "", make: "", model: "", vin: "" });

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const isBlank = (v: Vehicle) => !v.year && !v.make && !v.model && !v.vin;

/** Title-cases vendor text that arrives SHOUTING ("JEEP" -> "Jeep"). */
function tidy(word: string): string {
  if (!word) return "";
  if (word.length <= 3 && word === word.toUpperCase()) return word; // RAM, GMC, BMW
  return word
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** "2008 JEEP COMMANDER" -> { year: 2008, make: Jeep, model: Commander } */
export function parseVehicleString(input: string): Vehicle | null {
  const text = clean(input);
  if (!text) return null;
  const parts = text.split(/\s+/);
  const v = emptyVehicle();

  const yearAt = parts.findIndex((p) => /^(19|20)\d{2}$/.test(p));
  if (yearAt !== -1) {
    v.year = parts[yearAt];
    parts.splice(yearAt, 1);
  }
  if (parts.length) v.make = tidy(parts.shift() as string);
  if (parts.length) v.model = parts.map(tidy).join(" ");
  return isBlank(v) ? null : v;
}

function fromObject(o: Record<string, unknown>): Vehicle | null {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(o).find((x) => x.toLowerCase().replace(/[^a-z]/g, "") === k);
      if (hit && clean(o[hit])) return clean(o[hit]) as string;
    }
    return "";
  };
  const v: Vehicle = {
    year: pick("year", "vehicleyear", "modelyear"),
    make: tidy(pick("make", "vehiclemake")),
    model: tidy(pick("model", "vehiclemodel")),
    vin: pick("vin", "vehiclevin").toUpperCase(),
  };
  return isBlank(v) ? null : v;
}

/** Vehicles stored on the lead (our own JSON column). */
export function parseVehicles(raw: unknown): Vehicle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) =>
      typeof item === "string"
        ? parseVehicleString(item)
        : item && typeof item === "object"
          ? fromObject(item as Record<string, unknown>)
          : null,
    )
    .filter((v): v is Vehicle => v !== null);
}

/** Vehicles as the lead vendor sent them, before anyone edited the lead. */
export function vehiclesFromPayload(payload: unknown): Vehicle[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const found: Vehicle[] = [];

  for (const key of Object.keys(p)) {
    const flat = key.toLowerCase().replace(/[^a-z]/g, "");
    if (flat !== "vehicles" && flat !== "allvehicles" && flat !== "vehicle") continue;
    const value = p[key];

    if (typeof value === "string") {
      // One string holding every vehicle, separated by ; | or a newline.
      for (const chunk of value.split(/[;|\n]+/)) {
        const v = parseVehicleString(chunk);
        if (v) found.push(v);
      }
    } else if (Array.isArray(value)) {
      found.push(...parseVehicles(value));
    } else if (value && typeof value === "object") {
      const v = fromObject(value as Record<string, unknown>);
      if (v) found.push(v);
    }
  }

  // Vendors that send one vehicle as separate top-level fields.
  if (found.length === 0) {
    const v = fromObject(p);
    if (v) found.push(v);
  }
  return found;
}

/** Drivers listed by the vendor, e.g. ["jane doe (DOB 1990-01-02)"]. Read-only. */
export function driversFromPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const key = Object.keys(p).find((k) => {
    const flat = k.toLowerCase().replace(/[^a-z]/g, "");
    return flat === "drivers" || flat === "alldrivers";
  });
  if (!key) return [];
  const value = p[key];
  if (typeof value === "string") return value.split(/[;|\n]+/).map(clean).filter(Boolean) as string[];
  if (Array.isArray(value)) {
    return value
      .map((d) => (typeof d === "string" ? clean(d) : d && typeof d === "object" ? clean((d as Record<string, unknown>).name) : ""))
      .filter(Boolean) as string[];
  }
  return [];
}

/** Drops blank rows before saving. */
export const cleanVehicles = (list: Vehicle[]): Vehicle[] =>
  list
    .map((v) => ({ year: clean(v.year) as string, make: clean(v.make) as string, model: clean(v.model) as string, vin: (clean(v.vin) as string).toUpperCase() }))
    .filter((v) => !isBlank(v));

export const describeVehicle = (v: Vehicle) =>
  [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
