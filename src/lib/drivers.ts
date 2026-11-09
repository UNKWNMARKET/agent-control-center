/**
 * Listed drivers on a household — everyone a carrier needs rated or excluded.
 */

export type Driver = {
  name: string;
  dob: string;
  license: string;
  relationship: string;
};

export const emptyDriver = (): Driver => ({ name: "", dob: "", license: "", relationship: "" });

export const RELATIONSHIPS = ["Self", "Spouse", "Child", "Parent", "Other", "Excluded"];

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const isBlank = (d: Driver) => !d.name && !d.dob && !d.license;

export function parseDrivers(raw: unknown): Driver[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const d: Driver = {
        name: clean(o.name),
        dob: clean(o.dob),
        license: clean(o.license).toUpperCase(),
        relationship: clean(o.relationship),
      };
      return isBlank(d) ? null : d;
    })
    .filter((d): d is Driver => d !== null);
}

export const cleanDrivers = (list: Driver[]): Driver[] =>
  list
    .map((d) => ({
      name: clean(d.name),
      dob: clean(d.dob),
      license: clean(d.license).toUpperCase(),
      relationship: clean(d.relationship),
    }))
    .filter((d) => !isBlank(d));
