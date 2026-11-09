import { Flame } from "lucide-react";
import { SCORE_META, type ScoreTier } from "@/lib/score";
import { cn } from "@/lib/utils";

export function ScoreBadge({
  tier,
  value,
}: {
  tier: ScoreTier;
  value?: number;
}) {
  if (tier === "NONE") return null;
  const meta = SCORE_META[tier];
  return (
    <span
      className={cn("chip", meta.chip)}
      title={value != null ? `Priority score ${value}/100` : undefined}
    >
      {tier === "HOT" ? <Flame size={12} /> : null}
      {meta.label}
    </span>
  );
}
