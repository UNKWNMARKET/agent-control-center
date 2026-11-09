import type { DncStatus } from "@prisma/client";
import { db } from "./auth";

/** Normalize any phone input to a 10-digit US number, or null if invalid. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export type ScrubResult = { status: DncStatus; reason: string | null };

/**
 * Query a national DNC provider, if one is configured.
 * Provider-agnostic: set DNC_API_URL to a GET-JSON endpoint template containing
 * {phone} and {key}, e.g.
 *   https://api.realvalidation.com/rpvWebService/DNCLookup.php?phone={phone}&token={key}&output=json
 * Returns null when no provider is configured or the call fails.
 */
async function checkProvider(
  phone10: string,
): Promise<{ blocked: boolean; reason: string } | null> {
  const key = process.env.DNC_API_KEY;
  const template = process.env.DNC_API_URL;
  if (!key || !template) return null;

  const url = template
    .replace("{phone}", phone10)
    .replace("{key}", encodeURIComponent(key));

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error("[dnc] provider responded", res.status);
      return null;
    }
    const data: unknown = await res.json();

    // Generic interpretation: flag as blocked if any DNC/litigator field is truthy.
    const FLAGS = [
      "national_dnc", "state_dnc", "dnc", "litigator", "tcpa", "is_dnc",
      "blacklist", "blocked", "donotcall",
    ];
    const hits: string[] = [];
    const isTruthy = (v: unknown) =>
      v === true || v === 1 || v === "1" || v === "Y" || v === "y" || v === "true";
    const scan = (obj: unknown) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          scan(v);
          continue;
        }
        const key = k.toLowerCase().replace(/[^a-z]/g, "");
        if (isTruthy(v) && FLAGS.some((f) => key.includes(f.replace(/[^a-z]/g, "")))) {
          hits.push(k);
        }
      }
    };
    scan(data);

    if (hits.length) {
      return { blocked: true, reason: `National DNC list (${hits.join(", ")})` };
    }
    return { blocked: false, reason: "Cleared by national DNC scrub" };
  } catch (err) {
    console.error("[dnc] provider call failed", err);
    return null;
  }
}

/**
 * Scrub a phone number. Checks the internal suppression list first, then a
 * national provider if configured. `internalSet` lets bulk callers (imports)
 * avoid one DB lookup per row.
 */
export async function scrubPhone(
  rawPhone: string | null | undefined,
  internalSet?: Set<string>,
): Promise<ScrubResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { status: "UNKNOWN", reason: "No valid phone number" };

  if (internalSet) {
    if (internalSet.has(phone)) {
      return { status: "BLOCKED", reason: "On your internal Do-Not-Call list" };
    }
  } else {
    const entry = await db.dncEntry.findUnique({ where: { phone } });
    if (entry) {
      return {
        status: "BLOCKED",
        reason: entry.reason || "On your internal Do-Not-Call list",
      };
    }
  }

  const provider = await checkProvider(phone);
  if (provider) {
    return provider.blocked
      ? { status: "BLOCKED", reason: provider.reason }
      : { status: "OK", reason: provider.reason };
  }

  return { status: "OK", reason: "Not on your internal Do-Not-Call list" };
}

/** Scrub a phone and return the persistable Lead fields. */
export async function scrubFields(
  rawPhone: string | null | undefined,
  internalSet?: Set<string>,
): Promise<{ dncStatus: DncStatus; dncReason: string | null; dncCheckedAt: Date }> {
  const result = await scrubPhone(rawPhone, internalSet);
  return {
    dncStatus: result.status,
    dncReason: result.reason,
    dncCheckedAt: new Date(),
  };
}

/** Load the internal DNC list as a Set of normalized numbers (for bulk scrubbing). */
export async function loadInternalDncSet(): Promise<Set<string>> {
  const entries = await db.dncEntry.findMany({ select: { phone: true } });
  return new Set(entries.map((e) => e.phone));
}

export async function addToInternalDnc(
  rawPhone: string,
  reason: string | null,
  createdBy: string,
): Promise<boolean> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return false;
  await db.dncEntry.upsert({
    where: { phone },
    update: { reason: reason ?? undefined },
    create: { phone, reason: reason ?? undefined, createdBy },
  });
  return true;
}

export async function removeFromInternalDnc(rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return;
  await db.dncEntry.deleteMany({ where: { phone } });
}
