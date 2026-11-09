// Lead priority scoring — a simple, transparent heuristic so staff know which
// leads to work first. Computed live (no stored column), since it ages over time.

export type ScoreTier = "HOT" | "WARM" | "COLD" | "NONE";

export const SCORE_META: Record<
  Exclude<ScoreTier, "NONE">,
  { label: string; chip: string }
> = {
  HOT: { label: "Hot", chip: "bg-danger-soft text-danger" },
  WARM: { label: "Warm", chip: "bg-warning-soft text-warning" },
  COLD: { label: "Cold", chip: "bg-black/5 text-muted" },
};

export function leadScore(lead: {
  status: string;
  dncStatus: string;
  createdAt: Date | string;
  contactedAt: Date | string | null;
}): { tier: ScoreTier; value: number } {
  // Closed leads aren't prioritized.
  if (lead.status === "SOLD" || lead.status === "LOST") return { tier: "NONE", value: 0 };
  // Can't legally work it → always cold.
  if (lead.dncStatus === "BLOCKED" || lead.status === "DNC") return { tier: "COLD", value: 0 };

  let score = lead.status === "QUOTED" ? 50 : lead.status === "CONTACTED" ? 35 : 20;

  const ageDays = (Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000;
  score += ageDays <= 1 ? 40 : ageDays <= 3 ? 28 : ageDays <= 7 ? 15 : ageDays <= 30 ? 5 : 0;

  if (lead.contactedAt) {
    const sinceContact = (Date.now() - new Date(lead.contactedAt).getTime()) / 86_400_000;
    if (sinceContact <= 2) score += 10;
  }

  score = Math.min(100, score);
  const tier: ScoreTier = score >= 66 ? "HOT" : score >= 38 ? "WARM" : "COLD";
  return { tier, value: Math.round(score) };
}
