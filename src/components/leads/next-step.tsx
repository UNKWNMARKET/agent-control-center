"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check } from "lucide-react";
import { setNextStep } from "@/app/actions/leads";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "In 2 weeks", days: 14 },
];

/**
 * One tap to schedule the next touch.
 *
 * Leads die from never getting a second call, not from a bad first one, so
 * this sits in the way when nothing is scheduled rather than hiding in a menu.
 */
export function NextStep({
  leadId,
  followUpAt,
  compact,
}: {
  leadId: string;
  followUpAt: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [justSet, setJustSet] = useState<number | null>(null);

  const choose = (days: number) =>
    start(async () => {
      await setNextStep(leadId, days);
      setJustSet(days);
      router.refresh();
    });

  const scheduled = Boolean(followUpAt);
  const due = followUpAt ? new Date(followUpAt) : null;
  const daysOut = due ? Math.round((due.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        scheduled ? "border-line bg-surface" : "border-transparent bg-warning-soft",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <CalendarClock size={15} className={scheduled ? "text-muted" : "text-warning"} />
          {scheduled ? "Next touch" : "No next touch scheduled"}
        </span>

        {scheduled && due ? (
          <span className="text-sm text-muted">
            {due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
            {daysOut != null ? (daysOut <= 0 ? " · due now" : ` · in ${daysOut} day${daysOut === 1 ? "" : "s"}`) : ""}
          </span>
        ) : (
          <span className="text-sm text-warning">Pick one so this lead doesn&apos;t go quiet.</span>
        )}

        <div className={cn("flex flex-wrap gap-1.5", compact ? "" : "ml-auto")}>
          {OPTIONS.map((o) => (
            <button
              key={o.days}
              onClick={() => choose(o.days)}
              disabled={pending}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                justSet === o.days
                  ? "border-positive bg-positive-soft text-positive"
                  : "border-transparent bg-surface text-ink-2 hover:text-accent",
              )}
            >
              {justSet === o.days ? <Check size={12} className="mr-0.5 inline" /> : null}
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
