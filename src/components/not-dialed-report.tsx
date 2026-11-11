import Link from "next/link";
import type { ReactNode } from "react";
import type { LeadStatus } from "@prisma/client";
import { db } from "@/lib/auth";
import { STATUS_META } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/auto-refresh";

// Leads, renewals and transfers with no outbound RingCentral dial to their phone or
// second phone. Calls come from the `ringcentral` schema (synced every 2 minutes).
// Do Not Call records are left out: nobody should be dialing them.

type Row = {
  id: string;
  name: string;
  kind: string;
  agentId: string | null;
  agent: string | null;
  status: string;
  phone: string | null;
  createdAt: Date;
};

export type NotDialedFilters = { period?: string; kind?: string; agent?: string };

const KINDS = [
  { value: "Lead", label: "Leads" },
  { value: "Renewal", label: "Renewals" },
  { value: "Transfer", label: "Transfers" },
] as const;

const NO_AGENT = "none";

async function loadNotDialed(monthOnly: boolean) {
  return db.$queryRaw<Row[]>`
    WITH b AS (
      SELECT date_trunc('month', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York' AS m0
    ),
    dialed AS (
      SELECT DISTINCT k.other_party_digits AS d
      FROM ringcentral.calls k
      CROSS JOIN b
      WHERE k.direction = 'Outbound'
        AND k.other_party_digits IS NOT NULL
        AND (${monthOnly}::boolean = false OR k.start_time >= b.m0)
    )
    SELECT l.id,
      trim(coalesce(l."firstName", '') || ' ' || coalesce(l."lastName", '')) AS name,
      CASE WHEN l.source = 'Auto renewal cross-sell' THEN 'Renewal'
           WHEN l.source = 'Auto Transfer' THEN 'Transfer'
           ELSE 'Lead' END AS kind,
      l."assignedToId" AS "agentId",
      u.name AS agent,
      l.status::text AS status,
      l.phone,
      l."createdAt" AS "createdAt"
    FROM "Lead" l
    LEFT JOIN "User" u ON u.id = l."assignedToId"
    WHERE l.status <> 'DNC'
      AND NOT EXISTS (
        SELECT 1 FROM dialed
        WHERE dialed.d IN (ringcentral.digits10(l.phone), ringcentral.digits10(l."phoneSecondary"))
      )
    ORDER BY l."createdAt" ASC
  `;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-[13px] transition-colors",
        active ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:bg-fill",
      )}
    >
      {children}
    </Link>
  );
}

export async function NotDialedReport({ filters }: { filters: NotDialedFilters }) {
  const monthOnly = filters.period === "month";
  let rows: Row[] | null = null;
  try {
    rows = await loadNotDialed(monthOnly);
  } catch (err) {
    console.error("Not dialed report failed to load", err);
  }

  if (!rows) {
    return (
      <div className="card p-5">
        <h2 className="text-[15px] font-semibold text-ink">Not dialed</h2>
        <p className="mt-1 text-[13px] text-muted">
          Call data from RingCentral couldn&apos;t be loaded right now. Refresh in a minute.
        </p>
      </div>
    );
  }

  const kind = KINDS.some((k) => k.value === filters.kind) ? filters.kind : undefined;
  const agent = filters.agent || undefined;
  const agentOf = (r: Row) => r.agentId ?? NO_AGENT;

  const href = (patch: NotDialedFilters) => {
    const next = { period: filters.period, kind, agent, ...patch };
    const q = new URLSearchParams({ tab: "not-dialed" });
    if (next.period === "month") q.set("period", "month");
    if (next.kind) q.set("kind", next.kind);
    if (next.agent) q.set("agent", next.agent);
    return `/reports?${q.toString()}`;
  };

  // Chip counts follow the other filter, so each number matches what a click shows.
  const forAgent = rows.filter((r) => !agent || agentOf(r) === agent);
  const forKind = rows.filter((r) => !kind || r.kind === kind);
  const shown = forAgent.filter((r) => !kind || r.kind === kind);

  const agentChips = [...new Map(rows.map((r) => [agentOf(r), r.agent ?? "Unassigned"])).entries()]
    .map(([id, name]) => ({ id, name, count: forKind.filter((r) => agentOf(r) === id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const now = Date.now();
  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

  return (
    <section>
      <AutoRefresh seconds={120} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[28px] font-semibold leading-none tracking-tight text-ink">
            {shown.length.toLocaleString()}
          </p>
          <p className="mt-1.5 text-[13px] text-muted">
            {monthOnly
              ? "records nobody has dialed since the 1st of this month"
              : "records nobody has ever dialed in RingCentral"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line p-1">
          <Chip href={href({ period: undefined })} active={!monthOnly}>
            Never dialed
          </Chip>
          <Chip href={href({ period: "month" })} active={monthOnly}>
            Not dialed this month
          </Chip>
        </div>
      </div>

      <div className="card mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[12px] font-semibold uppercase tracking-wide text-faint">Type</span>
          <Chip href={href({ kind: undefined })} active={!kind}>
            All ({forAgent.length})
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k.value} href={href({ kind: k.value })} active={kind === k.value}>
              {k.label} ({forAgent.filter((r) => r.kind === k.value).length})
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="w-14 text-[12px] font-semibold uppercase tracking-wide text-faint">Agent</span>
          <Chip href={href({ agent: undefined })} active={!agent}>
            All agents ({forKind.length})
          </Chip>
          {agentChips.map((a) => (
            <Chip key={a.id} href={href({ agent: a.id })} active={agent === a.id}>
              {a.name} ({a.count})
            </Chip>
          ))}
        </div>
      </div>

      <div className="card mt-3 overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-semibold text-ink">Waiting for a first dial</h2>
          <p className="mt-0.5 text-[12px] text-faint">
            No outbound RingCentral call to the record&apos;s phone or second phone
            {monthOnly ? " since the 1st of this month" : ""}. Do Not Call records are left out.
            Oldest first. Updates every 2 minutes.
          </p>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Every record in this view has been dialed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                  <th className="px-5 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Agent</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Phone</th>
                  <th className="px-3 py-2.5">Added</th>
                  <th className="px-5 py-2.5 text-right">Days waiting</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const days = Math.max(0, Math.floor((now - new Date(r.createdAt).getTime()) / 86400000));
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 font-medium text-ink">
                        <Link href={`/leads/${r.id}`} className="hover:underline">
                          {r.name || "No name"}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{r.kind}</td>
                      <td className="px-3 py-2.5 text-ink-2">{r.agent ?? "Unassigned"}</td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {STATUS_META[r.status as LeadStatus]?.label ?? r.status}
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{r.phone || "No phone"}</td>
                      <td className="px-3 py-2.5 text-ink-2">{fmtDate(r.createdAt)}</td>
                      <td
                        className={cn(
                          "px-5 py-2.5 text-right",
                          days >= 7 ? "font-semibold text-ink" : "text-ink-2",
                        )}
                      >
                        {days}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
