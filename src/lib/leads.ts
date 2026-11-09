import type { LeadStatus } from "@prisma/client";

export const LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUOTED",
  "SOLD",
  "LOST",
  "DNC",
];

export const STATUS_META: Record<
  LeadStatus,
  { label: string; chip: string; dot: string }
> = {
  NEW: { label: "New", chip: "bg-accent-soft text-accent", dot: "bg-accent" },
  CONTACTED: { label: "Contacted", chip: "bg-info-soft text-info", dot: "bg-info" },
  QUOTED: { label: "Quoted", chip: "bg-warning-soft text-warning", dot: "bg-warning" },
  SOLD: { label: "Sold", chip: "bg-positive-soft text-positive", dot: "bg-positive" },
  LOST: { label: "Lost", chip: "bg-black/5 text-muted", dot: "bg-faint" },
  DNC: { label: "Do Not Call", chip: "bg-danger-soft text-danger", dot: "bg-danger" },
};

export const PRODUCTS = [
  "Auto",
  "Home",
  "Life",
  "Health",
  "Renters",
  "Commercial",
  "Umbrella",
  "Motorcycle",
  "Boat",
  "Other",
];

/** A normalized lead extracted from an arbitrary vendor payload. */
export type NormalizedLead = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  phoneSecondary?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  dob?: string;
  maritalStatus?: string;
  product?: string;
  externalId?: string;
  premium?: number;
  /** When their current policy expires — the X-date, the moment they can switch. */
  policyExpiresAt?: Date;
  currentCarrier?: string;
};

/** Vendors send dates as MM/DD/YYYY, YYYY-MM-DD, or a month and year. */
export function parseVendorDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const s = value.trim();
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  // Anything more than a decade out is junk data, not a renewal date.
  const years = Math.abs(d.getFullYear() - new Date().getFullYear());
  return years > 10 ? undefined : d;
}

/** Flatten a (possibly nested) payload into a map of lowercased leaf-key -> string value. */
function flatten(obj: unknown, out: Record<string, string> = {}): Record<string, string> {
  if (obj == null || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === "object") {
      flatten(v, out);
    } else {
      const key = k.toLowerCase().replace(/[\s\-.]/g, "_");
      // first writer wins for top-level fields; only fill if empty
      if (!(key in out)) out[key] = String(v).trim();
    }
  }
  return out;
}

function pick(map: Record<string, string>, aliases: string[]): string | undefined {
  for (const a of aliases) {
    const key = a.toLowerCase().replace(/[\s\-.]/g, "_");
    if (map[key]) return map[key];
  }
  return undefined;
}

/**
 * Map an arbitrary vendor payload (EverQuote, AllWebLeads, Smart Financial, etc.)
 * onto our lead fields. Unknown shapes are tolerated; the raw payload is kept
 * separately so nothing is ever lost.
 */
export function normalizeLead(payload: unknown): NormalizedLead {
  const m = flatten(payload);

  const premiumRaw = pick(m, [
    "premium",
    "premium_amount",
    "quote_amount",
    "monthly_premium",
    "estimated_premium",
  ]);
  const premium = premiumRaw ? Number(premiumRaw.replace(/[^0-9.]/g, "")) : undefined;

  return {
    firstName: pick(m, [
      "first_name", "firstname", "fname", "first", "given_name",
      "contact_first_name", "lead_first_name",
    ]),
    lastName: pick(m, [
      "last_name", "lastname", "lname", "last", "surname", "family_name",
      "contact_last_name", "lead_last_name",
    ]),
    email: pick(m, ["email", "email_address", "emailaddress", "e_mail", "contact_email"]),
    phone: pick(m, [
      "phone", "phone_number", "phonenumber", "primary_phone", "phone1", "phone_1",
      "home_phone", "mobile", "mobile_phone", "cell", "cell_phone", "contact_phone",
      "best_phone", "telephone",
    ]),
    phoneSecondary: pick(m, [
      "phone2", "phone_2", "secondary_phone", "work_phone", "alt_phone",
      "alternate_phone", "phone_secondary",
    ]),
    address1: pick(m, [
      "address", "address1", "address_1", "street", "street_address", "addr1",
      "address_line_1", "addressline1",
    ]),
    address2: pick(m, ["address2", "address_2", "addr2", "apt", "unit", "address_line_2"]),
    city: pick(m, ["city", "town", "municipality"]),
    state: pick(m, ["state", "st", "region", "province", "state_code", "state_abbr"]),
    zip: pick(m, ["zip", "zipcode", "zip_code", "postal_code", "postalcode", "postal"]),
    dob: pick(m, ["dob", "date_of_birth", "dateofbirth", "birthdate", "birth_date"]),
    maritalStatus: pick(m, ["marital_status", "maritalstatus", "marital"]),
    product: pick(m, [
      "product", "line_of_business", "lob", "insurance_type", "coverage_type",
      "vertical", "product_type", "insurance_line", "lead_type",
    ]),
    externalId: pick(m, [
      "lead_id", "leadid", "external_id", "vendor_lead_id", "transaction_id",
      "reference_id", "id",
    ]),
    premium: premium && !Number.isNaN(premium) ? premium : undefined,
    policyExpiresAt: parseVendorDate(
      pick(m, [
        "policy_expiration", "policy_expiration_date", "policy_expires", "expiration_date",
        "x_date", "xdate", "current_policy_expiration", "renewal_date", "policy_end_date",
      ]),
    ),
    currentCarrier: pick(m, [
      "current_carrier", "current_insurance_company", "current_insurer", "carrier",
      "existing_carrier", "prior_carrier",
    ]),
  };
}
