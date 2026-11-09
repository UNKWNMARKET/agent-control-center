/**
 * Property records for a lead's address — is this person a homeowner?
 *
 * Two free public sources, no API key:
 *  1. Census geocoder turns the street address into a point.
 *  2. Florida DOR's statewide cadastral layer (10.9M parcels, refreshed each
 *     July from all 67 county property appraisers) is queried by a small
 *     bounding box around that point. A point-in-polygon test misses, because
 *     the geocoder interpolates onto the street centerline, so we pull the
 *     neighbours and match on house number.
 *
 * Homestead alone does NOT prove ownership — a $0 homestead can be a recent
 * purchase, a second home, or an owner who never filed. Matching the parcel's
 * owner name against the lead's name is the stronger signal, so we use both.
 */

const GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const PARCELS =
  "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

export type Ownership = "OWNER" | "LIKELY_RENTER" | "UNCERTAIN" | "NOT_FOUND" | "NO_ADDRESS" | "ERROR";

export type PropertyInfo = {
  ownership: Ownership;
  homestead: boolean;
  ownerName: string | null;
  parcelAddress: string | null;
  justValue: number | null;
  homesteadValue: number | null;
  yearBuilt: number | null;
  /** The roll's "effective" year — jumps ahead of the build year after major work. */
  effectiveYear: number | null;
  livingArea: number | null;
  saleYear: number | null;
  salePrice: number | null;
  checkedAt: string;
  note?: string;
};

const blank = (ownership: Ownership, note?: string): PropertyInfo => ({
  ownership,
  homestead: false,
  ownerName: null,
  parcelAddress: null,
  justValue: null,
  homesteadValue: null,
  yearBuilt: null,
  effectiveYear: null,
  livingArea: null,
  saleYear: null,
  salePrice: null,
  checkedAt: new Date().toISOString(),
  note,
});

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const houseNumber = (s: string) => norm(s).match(/^\d+/)?.[0] ?? "";

/**
 * The identifying words of a street, minus the house number, unit, direction
 * and road-type suffix. "13605 NE 3 rd Ct Apt 206" and "13605 NE 3 CT" both
 * reduce to ["3"], so the same street survives either spelling.
 */
const ROAD_WORDS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST", "ST", "STREET", "DR", "DRIVE", "AVE", "AVENUE", "AV", "RD", "ROAD", "LN", "LANE", "CT", "COURT", "BLVD", "BLVD.", "CIR", "CIRCLE", "WAY", "PL", "PLACE", "TRL", "TRAIL", "TER", "TERRACE", "PKWY", "PARKWAY", "HWY", "HIGHWAY", "APT", "UNIT", "STE", "SUITE", "#", "THE"]);

function streetWords(address: string): string[] {
  const words = norm(address).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (i === 0 && /^\d+$/.test(w)) continue; // house number
    // "3 RD" / "66 TH" arrive split; fold the ordinal back onto the digits.
    if (/^(ST|ND|RD|TH)$/.test(w) && out.length && /^\d+$/.test(out[out.length - 1])) continue;
    w = w.replace(/^(\d+)(ST|ND|RD|TH)$/, "$1"); // 66TH -> 66
    if (ROAD_WORDS.has(w)) continue;
    if (/^\d+$/.test(w) && out.length === 0 && i > 0 && words[i - 1] === "APT") continue;
    out.push(w);
  }
  return out;
}

/**
 * One edit apart — catches vendor typos. Transpositions count as one edit,
 * because swapped letters ("CARVAHLO" for "CARVALHO") are the typo people
 * actually make, and plain edit distance scores those as two.
 */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 4 || b.length < 4) return false;

  if (a.length === b.length) {
    const diff: number[] = [];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) diff.push(k);
    if (diff.length === 2 && diff[1] === diff[0] + 1) {
      const [i, j] = diff;
      if (a[i] === b[j] && a[j] === b[i]) return true; // adjacent swap
    }
  }

  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length > b.length) i++;
    else j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Do two addresses name the same street? */
function streetsAgree(leadAddress: string, parcelAddress: string): boolean {
  const a = streetWords(leadAddress);
  const b = streetWords(parcelAddress);
  if (a.length === 0 || b.length === 0) return false;
  return a.some((x) => b.some((y) => closeEnough(x, y)));
}

/**
 * Florida rolls write owners last-name-first ("DOYLE JEFFREY M"), and often as
 * trusts, LLCs, or a couple ("SHARP DARRELL W & MARY").
 *
 * "full" = this lead is on the deed. "surname" = the deed carries the same
 * surname but a different first name, which is usually a spouse or relative —
 * the household owns the home even though this person isn't named.
 */
type NameMatch = "full" | "surname" | "none";

function ownerMatchesLead(owner: string, first: string | null, last: string | null): NameMatch {
  const o = norm(owner);
  const l = norm(last ?? "");
  const f = norm(first ?? "");
  if (!o || !l) return "none";

  const words = new Set(o.split(" "));
  // Compound surnames ("Jose Laprida") count if any part is on the deed.
  const surname = l.split(" ").some((part) => part.length > 1 && words.has(part));
  if (!surname) return "none";
  if (!f) return "surname";
  return words.has(f) || words.has(f[0]) ? "full" : "surname";
}

type Parcel = {
  OWN_NAME?: string; PHY_ADDR1?: string; PHY_CITY?: string; PHY_ZIPCD?: number;
  JV?: number; JV_HMSTD?: number; ACT_YR_BLT?: number; EFF_YR_BLT?: number; TOT_LVG_AR?: number;
  SALE_YR1?: number; SALE_PRC1?: number;
};

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(address: string): Promise<{ x: number; y: number } | null> {
  const url = `${GEOCODER}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const data = (await fetchJson(url, 12_000)) as {
    result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
  };
  const c = data.result?.addressMatches?.[0]?.coordinates;
  return c ? { x: c.x, y: c.y } : null;
}

async function parcelsNear(x: number, y: number, d: number): Promise<Parcel[]> {
  const envelope = `${x - d},${y - d},${x + d},${y + d}`;
  const params = new URLSearchParams({
    where: "1=1",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OWN_NAME,PHY_ADDR1,PHY_CITY,PHY_ZIPCD,JV,JV_HMSTD,ACT_YR_BLT,EFF_YR_BLT,TOT_LVG_AR,SALE_YR1,SALE_PRC1",
    returnGeometry: "false",
    resultRecordCount: "600",
    f: "json",
  });
  const data = (await fetchJson(`${PARCELS}?${params}`, 20_000)) as {
    features?: { attributes: Parcel }[];
    error?: { message?: string };
  };
  if (data.error) throw new Error(data.error.message || "Parcel query failed");
  return (data.features ?? []).map((f) => f.attributes);
}

/**
 * The parcel at this address: the house number AND the street must agree.
 *
 * Requiring the street matters — the search box covers a whole block, and a
 * neighbouring street often repeats the same house number. Matching on the
 * number alone silently returned a stranger's property.
 */
function pickParcel(parcels: Parcel[], address1: string): Parcel | null {
  const wanted = houseNumber(address1);
  if (!wanted) return null;
  const sameNumber = parcels.filter((p) => houseNumber(p.PHY_ADDR1 ?? "") === wanted);
  return sameNumber.find((p) => streetsAgree(address1, p.PHY_ADDR1 ?? "")) ?? null;
}

export async function lookupProperty(lead: {
  address1: string | null; city: string | null; state: string | null; zip: string | null;
  firstName: string | null; lastName: string | null;
}): Promise<PropertyInfo> {
  const address1 = (lead.address1 ?? "").trim();
  if (!address1) return blank("NO_ADDRESS", "No street address on this lead.");

  const full = [address1, lead.city, lead.state ?? "FL", lead.zip].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");

  try {
    const point = await geocode(full);
    if (!point) return blank("NOT_FOUND", "The address could not be matched to a map location.");

    // The geocoder lands on the street centerline, which can sit a long way
    // from the parcel on rural lots and big subdivisions. Widen until a hit.
    let parcel: Parcel | null = null;
    for (const radius of [0.0005, 0.0015, 0.004]) {
      parcel = pickParcel(await parcelsNear(point.x, point.y, radius), address1);
      if (parcel) break;
    }
    if (!parcel) return blank("NOT_FOUND", "No parcel found at this address in the state tax roll.");

    const homesteadValue = Number(parcel.JV_HMSTD ?? 0);
    const homestead = homesteadValue > 0;
    const owner = (parcel.OWN_NAME ?? "").trim();
    // Some rolls carry a placeholder instead of an owner (redacted under
    // Ch. 119, or a county's own filler). Treat it as unknown, not a name.
    const ownerWithheld = /^(REFERENCE ONLY|NOT ON FILE|CONFIDENTIAL|NONE|N\/A|UNKNOWN)\b/i.test(owner) || !owner;
    const matches = ownerWithheld ? "none" : ownerMatchesLead(owner, lead.firstName, lead.lastName);

    let ownership: Ownership;
    let note: string | undefined;
    if (ownerWithheld) {
      ownership = "UNCERTAIN";
      note = "The tax roll doesn't publish an owner name for this parcel, so ownership can't be confirmed.";
    } else if (matches === "full") {
      ownership = "OWNER";
      note = homestead ? undefined : "Owns the property, but no homestead exemption is on file.";
    } else if (matches === "surname" && homestead) {
      ownership = "OWNER";
      note = "The deed is in the same surname with a different first name — likely the same household.";
    } else if (matches === "surname") {
      ownership = "UNCERTAIN";
      note = "Same surname on the deed, but no homestead exemption is on file.";
    } else if (homestead) {
      ownership = "UNCERTAIN";
      note = "The property is owner-occupied, but the owner on record has a different name.";
    } else {
      ownership = "LIKELY_RENTER";
      note = "No homestead exemption and the owner on record has a different name.";
    }

    return {
      ownership,
      homestead,
      ownerName: owner || null,
      parcelAddress: [parcel.PHY_ADDR1, parcel.PHY_CITY].filter(Boolean).join(", ") || null,
      justValue: Number(parcel.JV ?? 0) || null,
      homesteadValue: homesteadValue || null,
      yearBuilt: Number(parcel.ACT_YR_BLT ?? 0) || null,
      effectiveYear: Number(parcel.EFF_YR_BLT ?? 0) || null,
      livingArea: Number(parcel.TOT_LVG_AR ?? 0) || null,
      saleYear: Number(parcel.SALE_YR1 ?? 0) || null,
      salePrice: Number(parcel.SALE_PRC1 ?? 0) || null,
      checkedAt: new Date().toISOString(),
      note,
    };
  } catch (err) {
    console.error("[property] lookup failed", err);
    return blank("ERROR", "The property record service did not respond. Try again.");
  }
}

/** Reads a stored lookup back off the lead. */
export function readProperty(raw: unknown): PropertyInfo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as PropertyInfo;
  return typeof p.ownership === "string" ? p : null;
}

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  OWNER: "Homeowner",
  LIKELY_RENTER: "Likely renter",
  UNCERTAIN: "Owner unclear",
  NOT_FOUND: "No record",
  NO_ADDRESS: "No address",
  ERROR: "Lookup failed",
};
