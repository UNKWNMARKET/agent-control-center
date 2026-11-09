"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneOff, PhoneCall, RefreshCw, ShieldCheck } from "lucide-react";
import type { DncStatus } from "@prisma/client";
import { DncDot, dncLabel } from "@/components/dnc-dot";
import { markLeadDnc, clearLeadDnc, rescrubLead } from "@/app/actions/leads";
import { formatDateTime } from "@/lib/utils";

export function DncControl({
  leadId,
  status,
  reason,
  checkedAt,
  hasPhone,
}: {
  leadId: string;
  status: DncStatus;
  reason: string | null;
  checkedAt: string | null;
  hasPhone: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2">
        <ShieldCheck size={17} className="text-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <DncDot status={status} reason={reason} />
          {dncLabel(status)}
        </p>
        <p className="truncate text-xs text-muted">
          {reason ?? "Not checked yet"}
          {checkedAt ? ` · checked ${formatDateTime(checkedAt)}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(() => rescrubLead(leadId))}
          disabled={pending || !hasPhone}
          className="btn btn-secondary py-1.5"
        >
          <RefreshCw size={14} /> Re-check
        </button>
        {status === "BLOCKED" ? (
          <button
            onClick={() => run(() => clearLeadDnc(leadId))}
            disabled={pending}
            className="btn btn-secondary py-1.5"
          >
            <PhoneCall size={14} /> Remove from DNC
          </button>
        ) : (
          <button
            onClick={() => run(() => markLeadDnc(leadId))}
            disabled={pending || !hasPhone}
            className="btn btn-danger py-1.5"
          >
            <PhoneOff size={14} /> Add to Do-Not-Call
          </button>
        )}
      </div>
    </div>
  );
}
