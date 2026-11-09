/**
 * Building permits for a lead's address, roofing first.
 *
 * Florida has no statewide permit record — every county and most cities run
 * their own building department — so this uses Shovels, which aggregates
 * permits nationwide. Two calls: resolve the address to a geo_id, then pull
 * the permits for it.
 *
 * Needs SHOVELS_API_KEY. Without it the panel falls back to the roof-age hint
 * from the tax roll and a web search link, so agents still get something.
 *
 * Docs: https://docs.shovels.ai/api-reference/permits/search-permits
 */

const API = "https://api.shovels.ai/v2";

export type Permit = {
  number: string | null;
  date: string | null;
  status: string | null;
  type: string | null;
  description: string | null;
  jobValue: number | null;
  tags: string[];
  isRoof: boolean;
};

export type PermitInfo = {
  status: "OK" | "NOT_CONFIGURED" | "NO_ADDRESS" | "NOT_FOUND" | "ERROR";
  permits: Permit[];
  roofCount: number;
  lastRoofDate: string | null;
  checkedAt: string;
  note?: string;
};

export const permitsConfigured = () => Boolean(process.env.SHOVELS_API_KEY);

const ROOF = /\broof|re-?roof|shingle|reshingle|tile\s*roof|truss/i;

const empty = (status: PermitInfo["status"], note?: string): PermitInfo => ({
  status,
  permits: [],
  roofCount: 0,
  lastRoofDate: null,
  checkedAt: new Date().toISOString(),
  note,
});

async function call(path: string, key: string, ms = 15_000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${API}${path}`, {
      signal: ctl.signal,
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the first usable string from a record, tolerating field renames. */
const str = (o: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
};

export function toPermit(raw: Record<string, unknown>): Permit {
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
  const description = str(raw, "description", "description_derived");
  const type = str(raw, "type", "subtype");
  const cents = typeof raw.job_value === "number" ? raw.job_value : null;
  return {
    number: str(raw, "number", "id"),
    date: str(raw, "issue_date", "file_date", "start_date", "final_date"),
    status: str(raw, "status"),
    type,
    description,
    jobValue: cents == null ? null : Math.round(cents / 100),
    tags,
    isRoof:
      tags.some((t) => /roof/i.test(t)) || ROOF.test(description ?? "") || ROOF.test(type ?? ""),
  };
}

export async function lookupPermits(lead: {
  address1: string | null; city: string | null; state: string | null; zip: string | null;
}): Promise<PermitInfo> {
  const key = process.env.SHOVELS_API_KEY;
  if (!key) return empty("NOT_CONFIGURED", "Add a Shovels API key to pull permits automatically.");
  if (!lead.address1?.trim()) return empty("NO_ADDRESS", "No street address on this lead.");

  try {
    const q = new URLSearchParams({
      street: lead.address1.trim(),
      city: (lead.city ?? "").trim(),
      state: (lead.state ?? "FL").trim(),
      zip: (lead.zip ?? "").trim(),
    });
    const found = (await call(`/addresses/search?${q}`, key)) as {
      items?: { geo_id?: string }[];
      results?: { geo_id?: string }[];
    };
    const geoId = (found.items ?? found.results ?? [])[0]?.geo_id;
    if (!geoId) {
      return empty(
        "NOT_FOUND",
        "This address isn't in the permit database. Many Florida building departments don't publish records, so this is not evidence that no work was done.",
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const permitQuery = new URLSearchParams({
      geo_id: geoId,
      permit_from: "1990-01-01",
      permit_to: today,
      size: "100",
    });
    const data = (await call(`/permits/search?${permitQuery}`, key)) as {
      items?: Record<string, unknown>[];
    };
    const permits = (data.items ?? []).map(toPermit);
    if (permits.length === 0) {
      return empty(
        "NOT_FOUND",
        "No permits returned for this address. Coverage varies by county, so this is not proof the roof was never replaced.",
      );
    }

    // Newest first; roofing is what an agent is looking for.
    permits.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const roofs = permits.filter((p) => p.isRoof);

    return {
      status: "OK",
      permits,
      roofCount: roofs.length,
      lastRoofDate: roofs[0]?.date ?? null,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "unauthorized") return empty("ERROR", "The Shovels API key was rejected.");
    if (msg === "rate_limited") return empty("ERROR", "Permit lookups are rate limited right now. Try again shortly.");
    console.error("[permits] lookup failed", err);
    return empty("ERROR", "The permit service did not respond.");
  }
}

export function readPermits(raw: unknown): PermitInfo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as PermitInfo;
  return typeof p.status === "string" && Array.isArray(p.permits) ? p : null;
}

/** Fallback when no key is configured: send the agent to a web search. */
export function permitSearchUrl(lead: { address1: string | null; city: string | null; state: string | null }): string {
  const q = `"${lead.address1 ?? ""}" ${lead.city ?? ""} ${lead.state ?? "FL"} roof permit building department`;
  return `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`;
}

/** Roof age matters to Florida carriers; this is the free signal we already have. */
export function roofAgeHint(yearBuilt: number | null, effectiveYear: number | null): string | null {
  if (!yearBuilt) return null;
  const age = new Date().getFullYear() - yearBuilt;
  if (effectiveYear && effectiveYear > yearBuilt + 5) {
    return `Built ${yearBuilt}, but the roll's effective year is ${effectiveYear} — major work was done, often a re-roof.`;
  }
  if (age >= 20) return `Built ${yearBuilt}. If the roof is original it is ${age} years old, which most Florida carriers will not write.`;
  if (age >= 15) return `Built ${yearBuilt}. An original roof would be ${age} years old — carriers will ask for proof of replacement.`;
  return null;
}
