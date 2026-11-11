"use client";

import { useEffect, useState, useTransition } from "react";
import { Home, RefreshCw, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { refreshProperty } from "@/app/actions/property";
import type { PropertyInfo, Ownership } from "@/lib/property";
import { cn } from "@/lib/utils";

const money = (n: number | null) =>
  n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");

export function OwnershipChip({ ownership, homestead, className }: { ownership: Ownership; homestead?: boolean; className?: string }) {
  const style: Record<Ownership, string> = {
    OWNER: "bg-positive-soft text-positive",
    LIKELY_RENTER: "bg-warning-soft text-warning",
    UNCERTAIN: "bg-info-soft text-info",
    NOT_FOUND: "bg-fill text-faint",
    NO_ADDRESS: "bg-fill text-faint",
    ERROR: "bg-fill text-faint",
  };
  const label: Record<Ownership, string> = {
    OWNER: homestead ? "Homeowner · homestead" : "Homeowner",
    LIKELY_RENTER: "Likely renter",
    UNCERTAIN: "Owner unclear",
    NOT_FOUND: "No record",
    NO_ADDRESS: "No address",
    ERROR: "Lookup failed",
  };
  const Icon = ownership === "OWNER" ? CheckCircle2 : ownership === "LIKELY_RENTER" ? XCircle : HelpCircle;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-medium", style[ownership], className)}>
      <Icon size={11} />
      {label[ownership]}
    </span>
  );
}

export function PropertyPanel({ leadId, initial }: { leadId: string; initial: PropertyInfo | null }) {
  const [info, setInfo] = useState<PropertyInfo | null>(initial);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const run = (force: boolean) =>
    start(async () => {
      try {
        setFailed(false);
        setInfo(await refreshProperty(leadId, force));
      } catch {
        setFailed(true);
      }
    });

  // Leads that arrived before this feature existed get looked up on first view.
  useEffect(() => {
    if (!initial) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: [string, string][] = info
    ? [
        ["Owner of record", info.ownerName ?? "—"],
        ["Homestead exemption", info.homestead ? `Yes · ${money(info.homesteadValue)}` : "No"],
        ["Year built", info.yearBuilt ? String(info.yearBuilt) : "—"],
        ["Living area", info.livingArea ? `${info.livingArea.toLocaleString("en-US")} sq ft` : "—"],
        ["Just value", money(info.justValue)],
        ["Last sale", info.saleYear ? `${info.saleYear}${info.salePrice ? ` · ${money(info.salePrice)}` : ""}` : "—"],
      ]
    : [];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        <Home size={15} />
        Property record
        {info ? <OwnershipChip ownership={info.ownership} homestead={info.homestead} className="normal-case tracking-normal" /> : null}
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          title="Check the state tax roll again"
          className="ml-auto rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
        </button>
      </div>

      {pending && !info ? (
        <p className="text-sm text-muted">Checking the state tax roll…</p>
      ) : failed ? (
        <p className="text-sm text-muted">Could not reach the property records service.</p>
      ) : info ? (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
          {info.note ? <p className="mt-2 text-xs text-faint">{info.note}</p> : null}
          <p className="mt-1 text-xs text-faint">
            Florida Department of Revenue tax roll{info.parcelAddress ? ` · ${info.parcelAddress}` : ""}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">No lookup yet.</p>
      )}
    </div>
  );
}
