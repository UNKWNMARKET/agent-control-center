"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Loader2 } from "lucide-react";
import { backfillProperties } from "@/app/actions/property";

/**
 * Looks up every lead that has never been checked, a batch at a time, so one
 * click can work through a backlog without a single long-running request.
 */
export function PropertyBackfill({ pending }: { pending: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [left, setLeft] = useState(pending);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    let total = 0;
    try {
      for (;;) {
        const res = await backfillProperties(10);
        total += res.done;
        setDone(total);
        setLeft(res.remaining);
        if (res.done === 0 || res.remaining === 0) break;
      }
      router.refresh();
    } catch {
      setError("The lookup stopped early. Click to continue where it left off.");
    }
    setRunning(false);
  };

  return (
    <div>
      <button onClick={run} disabled={running || left === 0} className="btn btn-secondary">
        {running ? <Loader2 size={15} className="animate-spin" /> : <Home size={15} />}
        {running ? "Checking…" : left === 0 ? "All leads checked" : `Look up ${left} lead${left === 1 ? "" : "s"}`}
      </button>
      {running || done > 0 ? (
        <p className="mt-2 text-sm text-muted">
          {done} checked{left > 0 ? ` · ${left} to go` : " · finished"}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-warning">{error}</p> : null}
    </div>
  );
}
