import Link from "next/link";
import type { Metadata } from "next";
import type { LeadStatus, Prisma } from "@prisma/client";
import {
  ArrowUpRight,
  TrendingUp,
  UserPlus,
  PhoneCall,
  BadgeCheck,
  CalendarClock,
  CalendarSync,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { StatusBadge, Avatar } from "@/components/ui";
import { DncDot } from "@/components/dnc-dot";
import { fullName, formatPhone, formatDate, timeAgo, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard · Agent Control Center" };

export default async function DashboardPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const scope: Prisma.LeadWhereInput = isAdmin ? {} : { assignedToId: user.id };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, newThisWeek, statusGroups, recent, unassigned, dueFollowUps, renewals] =
    await Promise.all([
      db.lead.count({ where: scope }),
      db.lead.count({ where: { ...scope, createdAt: { gte: weekAgo } } }),
      db.lead.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      db.lead.findMany({
        where: scope,
        orderBy: { createdAt: "desc" },
        take: 7,
        include: { vendor: true, assignedTo: true },
      }),
      isAdmin
        ? db.lead.count({ where: { assignedToId: null } })
        : Promise.resolve(0),
      db.lead.findMany({
        where: { ...scope, followUpAt: { not: null, lte: new Date() } },
        orderBy: { followUpAt: "asc" },
        take: 6,
      }),
      db.lead.findMany({
        where: {
          ...scope,
          status: { notIn: ["SOLD", "LOST", "DNC"] },
          OR: [{ source: "Auto renewal cross-sell" }, { tags: { has: "cross-sell" } }],
        },
        orderBy: { lastName: "asc" },
        take: 6,
      }),
    ]);

  const byStatus = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, 0]),
  ) as Record<LeadStatus, number>;
  for (const g of statusGroups) byStatus[g.status] = g._count._all;

  const sold = byStatus.SOLD;
  const working = byStatus.CONTACTED + byStatus.QUOTED;
  const conversion = total > 0 ? Math.round((sold / total) * 100) : 0;

  const stats = [
    { label: "Total leads", value: total, icon: <TrendingUp size={18} />, href: "/leads" },
    { label: "New this week", value: newThisWeek, icon: <UserPlus size={18} />, href: "/leads?status=NEW" },
    { label: "Working", value: working, icon: <PhoneCall size={18} />, href: "/leads?status=CONTACTED" },
    { label: "Sold", value: sold, icon: <BadgeCheck size={18} />, href: "/leads?status=SOLD" },
  ];

  return (
    <div>
      <div className="mb-7">
        <p className="text-sm text-muted">
          {greeting()}, {user.name.split(" ")[0]}
        </p>
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">
          {isAdmin ? "Agency overview" : "Your leads"}
        </h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="card tilt group p-5"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                {s.icon}
              </span>
              <ArrowUpRight
                size={16}
                className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
            <p className="mt-4 text-[30px] font-semibold leading-none tracking-tight text-ink">
              {s.value.toLocaleString()}
            </p>
            <p className="mt-1.5 text-[13px] text-muted">{s.label}</p>
          </Link>
        ))}
      </div>

      {renewals.length > 0 ? (
        <div className="card mt-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-accent-soft px-5 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-accent">
              <CalendarSync size={16} /> Renewal clients to work ({renewals.length})
            </h2>
            <Link href="/renewals" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {renewals.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}?from=%2Fdashboard`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <Avatar name={fullName(lead)} className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{fullName(lead)}</p>
                    <p className="truncate text-xs text-muted">
                      {lead.address1 ?? formatPhone(lead.phone)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-accent">
                    {lead.tags.includes("verify-owner") ? "verify owner" : "homeowner"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dueFollowUps.length > 0 ? (
        <div className="card mt-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-warning-soft px-5 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-warning">
              <CalendarClock size={16} /> Follow-ups due ({dueFollowUps.length})
            </h2>
            <Link
              href="/follow-ups"
              className="text-sm font-medium text-warning hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {dueFollowUps.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}?from=%2Fdashboard`}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <Avatar name={fullName(lead)} className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{fullName(lead)}</p>
                    <p className="truncate text-xs text-muted">{formatPhone(lead.phone)}</p>
                  </div>
                  <span className="text-xs font-medium text-warning">
                    {formatDate(lead.followUpAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Pipeline breakdown */}
        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-ink">Pipeline</h2>
            <span className="text-xs text-muted">{conversion}% sold</span>
          </div>
          <div className="mt-4 space-y-3">
            {LEAD_STATUSES.map((s) => {
              const count = byStatus[s];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <Link key={s} href={`/leads?status=${s}`} className="block">
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium text-ink-2">{STATUS_META[s].label}</span>
                    <span className="text-muted">{count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className={cn("h-full rounded-full", STATUS_META[s].dot)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
          {isAdmin && unassigned > 0 ? (
            <Link
              href="/leads?assignee=unassigned"
              className="mt-4 flex items-center justify-between rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm font-medium text-warning"
            >
              {unassigned} unassigned {unassigned === 1 ? "lead" : "leads"}
              <ArrowUpRight size={15} />
            </Link>
          ) : null}
        </div>

        {/* Recent leads */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Recent leads</h2>
            <Link href="/leads" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No leads yet. They’ll show up here as soon as they arrive.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}?from=%2Fdashboard`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <Avatar name={fullName(lead)} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {fullName(lead)}
                      </p>
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                        <DncDot status={lead.dncStatus} reason={lead.dncReason} className="h-2 w-2" />
                        {formatPhone(lead.phone)}
                        {lead.product ? ` · ${lead.product}` : ""}
                        {lead.vendor ? ` · ${lead.vendor.name}` : ""}
                      </p>
                    </div>
                    <div className="hidden sm:block">
                      <StatusBadge status={lead.status} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs text-faint">
                      {timeAgo(lead.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
