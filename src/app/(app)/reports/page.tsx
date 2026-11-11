import type { Metadata } from "next";
import type { LeadStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/auth";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { PageHeader } from "@/components/ui";
import { CallReport } from "@/components/call-report";
import { NotDialedReport } from "@/components/not-dialed-report";
import { ReportTabs } from "@/components/report-tabs";
import { formatCurrency, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports · Agent Control Center" };

type Bucket = { leads: number; sold: number; premium: number };
const emptyBucket = (): Bucket => ({ leads: 0, sold: 0, premium: 0 });

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (param(sp.tab) === "not-dialed") {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Leads, renewals and transfers nobody has dialed yet." />
        <ReportTabs active="not-dialed" />
        <NotDialedReport
          filters={{ period: param(sp.period), kind: param(sp.kind), agent: param(sp.agent) }}
        />
      </div>
    );
  }

  const [leads, vendors, users] = await Promise.all([
    db.lead.findMany({
      select: {
        vendorId: true,
        assignedToId: true,
        status: true,
        premium: true,
        source: true,
        createdAt: true,
        soldAt: true,
      },
    }),
    db.vendor.findMany({ select: { id: true, name: true, costPerLead: true } }),
    db.user.findMany({ select: { id: true, name: true, monthlyGoal: true } }),
  ]);

  const costByName: Record<string, number> = {};
  for (const v of vendors) if (v.costPerLead != null) costByName[v.name] = v.costPerLead;

  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const total = leads.length;
  const sold = leads.filter((l) => l.status === "SOLD").length;
  const conversion = total ? Math.round((sold / total) * 100) : 0;
  const premiumSold = leads
    .filter((l) => l.status === "SOLD" && l.premium)
    .reduce((s, l) => s + (l.premium ?? 0), 0);

  // by status
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const l of leads) byStatus[l.status]++;

  // by source
  const bySource = new Map<string, Bucket>();
  for (const l of leads) {
    const key = l.vendorId ? vendorName.get(l.vendorId) ?? "Other" : l.source ?? "Direct / Manual";
    const b = bySource.get(key) ?? emptyBucket();
    b.leads++;
    if (l.status === "SOLD") {
      b.sold++;
      b.premium += l.premium ?? 0;
    }
    bySource.set(key, b);
  }
  const sourceRows = [...bySource.entries()]
    .map(([name, b]) => ({ name, ...b }))
    .sort((a, b) => b.leads - a.leads);

  // by agent
  const byAgent = new Map<string, Bucket>();
  for (const l of leads) {
    const key = l.assignedToId ? userName.get(l.assignedToId) ?? "Unknown" : "Unassigned";
    const b = byAgent.get(key) ?? emptyBucket();
    b.leads++;
    if (l.status === "SOLD") {
      b.sold++;
      b.premium += l.premium ?? 0;
    }
    byAgent.set(key, b);
  }
  const agentRows = [...byAgent.entries()]
    .map(([name, b]) => ({ name, ...b }))
    .sort((a, b) => b.leads - a.leads);

  // 14-day intake trend
  const now = new Date();
  const days: { key: string; label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: 0,
    });
  }
  const dayMap = new Map(days.map((d) => [d.key, d]));
  for (const l of leads) {
    const d = dayMap.get(l.createdAt.toISOString().slice(0, 10));
    if (d) d.count++;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  const totalSpend = sourceRows.reduce(
    (s, r) => s + r.leads * (costByName[r.name] ?? 0),
    0,
  );
  const roi = premiumSold - totalSpend;

  // Monthly sales goals (sold this calendar month vs each agent's target)
  const monthStartTime = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  })();
  const goalRows = users
    .filter((u) => u.monthlyGoal != null)
    .map((u) => ({
      name: u.name,
      goal: u.monthlyGoal as number,
      sold: leads.filter(
        (l) =>
          l.assignedToId === u.id &&
          l.status === "SOLD" &&
          l.soldAt != null &&
          l.soldAt.getTime() >= monthStartTime,
      ).length,
    }))
    .sort((a, b) => b.sold - a.sold);

  const kpis = [
    { label: "Total leads", value: total.toLocaleString() },
    { label: "Sold", value: sold.toLocaleString() },
    { label: "Conversion", value: `${conversion}%` },
    { label: "Premium written", value: formatCurrency(premiumSold) },
    { label: "Lead spend", value: formatCurrency(totalSpend) },
    { label: "Premium − spend", value: formatCurrency(roi) },
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Performance across sources, agents, and pipeline." />
      <ReportTabs active="overview" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="card p-5">
            <p className="text-[28px] font-semibold leading-none tracking-tight text-ink">
              {k.value}
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{k.label}</p>
          </div>
        ))}
      </div>

      {/* RingCentral calls: daily, weekly, monthly */}
      <CallReport />

      {/* 14-day trend */}
      <div className="card mt-3 p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">New leads · last 14 days</h2>
        <div className="flex items-end gap-1.5" style={{ height: 140 }}>
          {days.map((d) => (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-md bg-accent transition-all"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: d.count ? 4 : 0 }}
                  title={`${d.count} leads`}
                />
              </div>
              <span className="text-[0.6rem] text-faint">{d.label.split(" ")[1]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PerfTable title="By source" rows={sourceRows} showPremium costByName={costByName} />
        <PerfTable title="By agent" rows={agentRows} showPremium />
      </div>

      {goalRows.length > 0 ? (
        <div className="card mt-3 p-5">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">
            Sales goals · this month
          </h2>
          <div className="space-y-3">
            {goalRows.map((g) => {
              const pct = g.goal > 0 ? Math.min(100, Math.round((g.sold / g.goal) * 100)) : 0;
              const hit = g.sold >= g.goal;
              return (
                <div key={g.name}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium text-ink-2">{g.name}</span>
                    <span className={cn(hit ? "font-semibold text-positive" : "text-muted")}>
                      {g.sold} / {g.goal}
                      {hit ? " ✓" : ""}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                    <div
                      className={cn("h-full rounded-full", hit ? "bg-positive" : "bg-accent")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Pipeline */}
      <div className="card mt-3 p-5">
        <h2 className="mb-4 text-[15px] font-semibold text-ink">Pipeline breakdown</h2>
        <div className="space-y-3">
          {LEAD_STATUSES.map((s) => {
            const count = byStatus[s];
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={s}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className="font-medium text-ink-2">{STATUS_META[s].label}</span>
                  <span className="text-muted">
                    {count} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
                  <div
                    className={cn("h-full rounded-full", STATUS_META[s].dot)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PerfTable({
  title,
  rows,
  showPremium,
  costByName,
}: {
  title: string;
  rows: { name: string; leads: number; sold: number; premium: number }[];
  showPremium?: boolean;
  costByName?: Record<string, number>;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-2.5">Name</th>
                <th className="px-3 py-2.5 text-right">Leads</th>
                <th className="px-3 py-2.5 text-right">Sold</th>
                <th className="px-3 py-2.5 text-right">Conv.</th>
                {showPremium ? <th className="px-3 py-2.5 text-right">Premium</th> : null}
                {costByName ? <th className="px-5 py-2.5 text-right">Spend</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const conv = r.leads ? Math.round((r.sold / r.leads) * 100) : 0;
                const cost = costByName?.[r.name];
                const spend = cost != null ? r.leads * cost : null;
                return (
                  <tr key={r.name} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-medium text-ink">{r.name}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{r.leads}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{r.sold}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{conv}%</td>
                    {showPremium ? (
                      <td className="px-3 py-2.5 text-right text-ink-2">
                        {r.premium ? formatCurrency(r.premium) : "—"}
                      </td>
                    ) : null}
                    {costByName ? (
                      <td className="px-5 py-2.5 text-right text-ink-2">
                        {spend != null ? formatCurrency(spend) : "—"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
