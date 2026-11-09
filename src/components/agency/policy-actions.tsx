"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Ban, Undo2 } from "lucide-react";
import { cancelPolicy, reinstatePolicy, renewPolicy } from "@/app/actions/leads";

/** Renew, cancel or reinstate, inline on the policy row. */
export function PolicyActions({
  policyId,
  status,
  cancelReason,
  showRenew,
}: {
  policyId: string;
  status: "ACTIVE" | "CANCELLED";
  cancelReason: string | null;
  showRenew?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      setAsking(false);
      setReason("");
      router.refresh();
    });

  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2">
        {cancelReason ? <span className="max-w-[160px] truncate text-xs text-faint">{cancelReason}</span> : null}
        <button
          onClick={() => run(() => reinstatePolicy(policyId))}
          disabled={pending}
          className="btn btn-secondary py-1.5"
          title="Put this policy back in force"
        >
          <Undo2 size={14} /> Reinstate
        </button>
      </div>
    );
  }

  if (asking) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason — non-payment, moved, switched…"
          className="input w-56 py-1.5 text-sm"
          autoFocus
        />
        <button onClick={() => run(() => cancelPolicy(policyId, reason))} disabled={pending} className="btn btn-danger py-1.5">
          Cancel policy
        </button>
        <button onClick={() => setAsking(false)} disabled={pending} className="btn btn-ghost py-1.5">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {showRenew ? (
        <button
          onClick={() => run(() => renewPolicy(policyId))}
          disabled={pending}
          className="btn btn-primary py-1.5"
          title="Start another term from the current expiration date"
        >
          <RotateCw size={14} /> Renew
        </button>
      ) : null}
      <button onClick={() => setAsking(true)} disabled={pending} className="btn btn-secondary py-1.5">
        <Ban size={14} /> Cancel
      </button>
    </div>
  );
}
