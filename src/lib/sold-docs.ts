/**
 * What has to happen before a sale can be recorded.
 *
 * Underwriting asks for these after the fact, and chasing an agent for a dec
 * page a week later is how policies get cancelled. So the sale is gated: the
 * answers come first, each answer asks for its file straight away, and only
 * once everything is on the record does the policy exist.
 *
 * The rules live here so the dialog and the server action can't drift apart.
 */

/* ── Carriers ─────────────────────────────────────────────────────────── */

export const CARRIERS = [
  "AAA",
  "GeoVera",
  "Security First",
  "Citizens",
  "RLI Umbrella",
  "Cabrillo Coastal",
  "Progressive",
  "Progressive Commercial",
] as const;
export type Carrier = (typeof CARRIERS)[number];

export const isCarrier = (v: unknown): v is Carrier =>
  typeof v === "string" && (CARRIERS as readonly string[]).includes(v);

/** AAA is the one we hold paperwork rules for; the rest are expanded markets. */
export const isExpandedMarket = (carrier: string | null | undefined) =>
  Boolean(carrier) && carrier !== "AAA";

export const EXPANDED_MARKET_REMINDER =
  "Remember to upload any important documents here.";

/* ── What was sold, for AAA ───────────────────────────────────────────── */

export const AAA_LINES = ["AUTO", "PACKAGE"] as const;
export type AaaLine = (typeof AAA_LINES)[number];

export const AAA_LINE_LABELS: Record<AaaLine, string> = {
  AUTO: "Auto",
  PACKAGE: "Package",
};

/* ── Documents ────────────────────────────────────────────────────────── */

export const DOC_KINDS = [
  "VIN_CHECK",
  "PRIOR_AUTO",
  "WIND_MIT",
  "PRIOR_HOME",
  "HOME_OWNERSHIP",
  "OTHER",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LABELS: Record<DocKind, string> = {
  VIN_CHECK: "VIN checks",
  PRIOR_AUTO: "Prior auto declaration page",
  WIND_MIT: "Wind mitigation report",
  PRIOR_HOME: "Proof of prior home insurance",
  HOME_OWNERSHIP: "Proof of home ownership",
  OTHER: "Other document",
};

export const isDocKind = (v: unknown): v is DocKind =>
  typeof v === "string" && (DOC_KINDS as readonly string[]).includes(v);

/* ── The answers an agent gives at the point of sale ──────────────────── */

export type SoldAnswers = {
  carrier: string | null;
  /** Only asked for AAA. */
  line: AaaLine | null;
  priorAutoDeclared: boolean;
  windMitDiscount: boolean;
  policyNumber: string;
};

export const NO_ANSWERS: SoldAnswers = {
  carrier: null,
  line: null,
  priorAutoDeclared: false,
  windMitDiscount: false,
  policyNumber: "",
};

export type Requirement = {
  kind: DocKind;
  label: string;
  /** Why it's being asked for, shown under the row. */
  why: string;
  /** How it reads in a list of what's outstanding. */
  ask: string;
};

/**
 * The files this particular sale needs.
 *
 * Only AAA has required paperwork. An auto policy needs VIN checks, plus the
 * prior auto dec page if prior insurance was declared. A package adds the
 * home side: the wind mitigation report when that discount was given, and
 * proof of prior home insurance every time.
 *
 * The expanded markets have no required list — they get a reminder instead,
 * because what underwriting wants varies by carrier.
 */
export function requiredDocs(answers: SoldAnswers): Requirement[] {
  if (answers.carrier !== "AAA" || !answers.line) return [];

  const list: Requirement[] = [
    {
      kind: "VIN_CHECK",
      label: DOC_LABELS.VIN_CHECK,
      why: "Required on every AAA auto and package policy.",
      ask: "Upload the VIN checks.",
    },
  ];

  if (answers.priorAutoDeclared) {
    list.push({
      kind: "PRIOR_AUTO",
      label: DOC_LABELS.PRIOR_AUTO,
      why: "Prior auto insurance was declared.",
      ask: "Upload the prior auto declaration page.",
    });
  }

  if (answers.line === "PACKAGE") {
    if (answers.windMitDiscount) {
      list.push({
        kind: "WIND_MIT",
        label: DOC_LABELS.WIND_MIT,
        why: "A wind mitigation discount was given.",
      ask: "Upload the wind mitigation report.",
      });
    }
    list.push({
      kind: "PRIOR_HOME",
      label: DOC_LABELS.PRIOR_HOME,
      why: "Required on every package policy.",
      ask: "Upload the proof of prior home insurance.",
    });
  }

  return list;
}

/** The required files that aren't on the record yet. */
export function missingDocs(
  answers: SoldAnswers,
  onFile: readonly (string | null)[],
): Requirement[] {
  const have = new Set(onFile.filter(Boolean) as string[]);
  return requiredDocs(answers).filter((r) => !have.has(r.kind));
}

/**
 * Everything standing between this sale and being recorded, in plain words.
 * Empty means it's ready to save.
 */
export function blockers(
  answers: SoldAnswers,
  onFile: readonly (string | null)[],
): string[] {
  const out: string[] = [];
  if (!answers.carrier) out.push("Choose what was sold.");
  else if (answers.carrier === "AAA" && !answers.line) out.push("Choose Auto or Package.");
  if (!answers.policyNumber.trim()) out.push("Enter the policy number.");
  for (const m of missingDocs(answers, onFile)) out.push(m.ask);
  return out;
}

/** One sentence naming what's outstanding, for an error message. */
export function blockersMessage(list: string[]): string {
  if (list.length === 0) return "";
  return `Not ready yet — ${list.join(" ")}`;
}
