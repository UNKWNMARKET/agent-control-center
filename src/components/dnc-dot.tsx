import type { DncStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

const META: Record<DncStatus, { dot: string; label: string; chip: string }> = {
  OK: { dot: "bg-positive", label: "OK to call & text", chip: "bg-positive-soft text-positive" },
  BLOCKED: { dot: "bg-danger", label: "Do Not Call", chip: "bg-danger-soft text-danger" },
  UNKNOWN: { dot: "bg-faint", label: "Not checked", chip: "bg-fill text-muted" },
};

export function dncLabel(status: DncStatus) {
  return META[status].label;
}

/** Small colored dot shown next to a phone number. */
export function DncDot({
  status,
  reason,
  className,
}: {
  status: DncStatus;
  reason?: string | null;
  className?: string;
}) {
  const m = META[status];
  return (
    <span
      title={reason || m.label}
      aria-label={`${m.label}${reason ? ` — ${reason}` : ""}`}
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", m.dot, className)}
    />
  );
}

/** Labeled compliance badge for the lead detail page. */
export function DncBadge({
  status,
  reason,
}: {
  status: DncStatus;
  reason?: string | null;
}) {
  const m = META[status];
  return (
    <span className={cn("chip", m.chip)} title={reason || undefined}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
