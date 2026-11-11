"use client";

import { useEffect, useState, useTransition } from "react";
import { FileCheck2, RefreshCw, ExternalLink, Home } from "lucide-react";
import { refreshPermits } from "@/app/actions/property";
import type { PermitInfo } from "@/lib/permits";
import { cn } from "@/lib/utils";

const year = (d: string | null) => (d ? d.slice(0, 4) : "—");
const money = (n: number | null) => (n == null ? null : "$" + n.toLocaleString("en-US"));

function ago(date: string | null): string | null {
  if (!date) return null;
  const years = Math.floor((Date.now() - new Date(date).getTime()) / (365.25 * 86_400_000));
  if (years <= 0) return "this year";
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function PermitsPanel({
  leadId,
  initial,
  configured,
  searchUrl,
  roofHint,
}: {
  leadId: string;
  initial: PermitInfo | null;
  configured: boolean;
  searchUrl: string;
  roofHint: string | null;
}) {
  const [info, setInfo] = useState<PermitInfo | null>(initial);
  const [pending, start] = useTransition();

  const run = (force: boolean) =>
    start(async () => {
      try {
        setInfo(await refreshPermits(leadId, force));
      } catch {
        /* the panel keeps whatever it already had */
      }
    });

  useEffect(() => {
    if (configured && (!initial || initial.status === "NOT_CONFIGURED")) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const permits = info?.permits ?? [];
  const roofs = permits.filter((p) => p.isRoof);
  const others = permits.filter((p) => !p.isRoof);

  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        <FileCheck2 size={15} />
        Permits
        {info?.status === "OK" ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[0.65rem] font-medium normal-case tracking-normal",
              info.roofCount > 0 ? "bg-positive-soft text-positive" : "bg-fill text-faint",
            )}
          >
            {info.roofCount > 0
              ? `Roof permit ${year(info.lastRoofDate)}${ago(info.lastRoofDate) ? ` · ${ago(info.lastRoofDate)}` : ""}`
              : "No roof permit found"}
          </span>
        ) : null}
        {configured ? (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={pending}
            title="Check permit records again"
            className="ml-auto rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
          </button>
        ) : null}
      </div>

      {pending && !info ? <p className="text-sm text-muted">Checking permit records…</p> : null}

      {roofHint ? (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-warning">
          <Home size={13} className="mt-0.5 shrink-0" />
          {roofHint}
        </p>
      ) : null}

      {info?.status === "OK" && permits.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {[...roofs, ...others].slice(0, 8).map((p, i) => (
            <li key={`${p.number ?? i}`} className="flex flex-wrap items-baseline gap-x-2">
              <span className={cn("font-medium", p.isRoof ? "text-positive" : "text-ink-2")}>
                {year(p.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-2" title={p.description ?? undefined}>
                {p.description || p.type || "Permit"}
              </span>
              {p.jobValue ? <span className="text-xs text-faint">{money(p.jobValue)}</span> : null}
              {p.status ? <span className="text-xs text-faint">{p.status}</span> : null}
            </li>
          ))}
          {permits.length > 8 ? (
            <li className="text-xs text-faint">+{permits.length - 8} more on file</li>
          ) : null}
          {info.roofCount === 0 ? (
            <li className="text-xs text-faint">
              No roofing permit among them — but not every Florida building department
              reports to this database, so treat it as unconfirmed rather than proof.
            </li>
          ) : null}
        </ul>
      ) : null}

      {info && info.status !== "OK" && info.note ? (
        <p className="text-sm text-muted">{info.note}</p>
      ) : null}

      {!configured ? (
        <p className="mt-1 text-xs text-faint">
          Automatic permit pulls need a Shovels API key in Vercel. Until then, search the
          county records directly.
        </p>
      ) : null}

      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent"
      >
        Search county permit records <ExternalLink size={12} />
      </a>
    </div>
  );
}
