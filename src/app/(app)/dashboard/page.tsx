import Link from "next/link";
import type { Metadata } from "next";
import type { LeadStatus, Prisma } from "@prisma/client";
import { ArrowUpRight, CalendarClock, RefreshCw } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { StatusBadge, Avatar, CardHeader } from "@/components/ui";
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
    { label: "Total leads", value: total, href: "/leads" },
    { label: "New this week", value: newThisWeek, href: "/leads?status=NEW" },
    { label: "Working", value: working, href: "/leads?status=CONTACTED" },
    { label: "Sold", value: sold, href: "/leads?status=SOLD" },
  ];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{today}</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">
          {greeting()}, {user.name.split(" ")[0]}
        </h1>
      </div>

      {/* The numbers, in one quiet row. Each is a way into the list behind it. */}
      <div className="card grid grid-cols-2 overflow-hidden lg:grid-cols-4">
        {stats.map((s, i) => (
          <Link
            key={s.label}
            href={s.href}
            className={cn(
              "group px-5 py-4 transition-colors hover:bg-surface-2",
              i % 2 === 1 && "border-l border-line",
              i >= 2 && "border-t border-line lg:border-t-0",
              i === 2 && "lg:border-l",
            )}
          >
            <p className="flex items-center justify-between text-[13px] text-muted">
              {s.label}
              <ArrowUpRight
                size={14}
                className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
              />
            </p>
            <p className="tabular mt-1 text-[28px] font-semibold leading-none tracking-tight text-ink">
              {s.value.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>

      {isAdmin && unassigned > 0 ? (
        <Link
          href="/leads?assignee=unassigned"
          className="card card-interactive mt-3 flex items-center gap-3 px-5 py-3 text-sm"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          <span className="font-medium text-ink">
            {unassigned} {unassigned === 1 ? "lead is" : "leads are"} waiting to be assigned
          </span>
          <span className="ml-auto flex items-center gap-1 font-medium text-accent">
            Assign <ArrowUpRight size={14} />
          </span>
        </Link>
      ) : null}

      {/* What needs doing today. */}
      {dueFollowUps.length > 0 || renewals.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {dueFollowUps.length > 0 ? (
            <div className="card overflow-hidden pb-1.5">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <CalendarClock size={16} className="text-warning" /> Follow-ups due
                  </span>
                }
              >
                <Link href="/follow-ups" className="text-[13px] font-medium text-accent hover:underline">
                  See all
                </Link>
              </CardHeader>
              <ul>
                {dueFollowUps.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/leads/${lead.id}?from=%2Fdashboard`}
                      className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-surface-2"
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

          {renewals.length > 0 ? (
            <div className="card overflow-hidden pb-1.5">
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <RefreshCw size={16} className="text-accent" /> Renewals to work
                  </span>
                }
              >
                <Link href="/renewals" className="text-[13px] font-medium text-accent hover:underline">
                  See all
                </Link>
              </CardHeader>
              <ul>
                {renewals.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/leads/${lead.id}?from=%2Fdashboard`}
                      className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-surface-2"
                    >
                      <Avatar name={fullName(lead)} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{fullName(lead)}</p>
                        <p className="truncate text-xs text-muted">
                          {lead.address1 ?? formatPhone(lead.phone)}
                        </p>
                      </div>
                      <span className="text-xs text-muted">
                        {lead.tags.includes("verify-owner") ? "Verify owner" : "Homeowner"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Pipeline breakdown */}
        <div className="card pb-4 lg:col-span-1">
          <CardHeader title="Pipeline">
            <span className="text-[13px] text-muted">{conversion}% sold</span>
          </CardHeader>
          <div className="mt-1 space-y-3 px-5">
            {LEAD_STATUSES.map((s) => {
              const count = byStatus[s];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <Link key={s} href={`/leads?status=${s}`} className="group block">
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-ink-2 group-hover:text-ink">{STATUS_META[s].label}</span>
                    <span className="tabular text-muted">{count}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-fill">
                    <div
                      className={cn("h-full rounded-full", STATUS_META[s].dot)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent leads */}
        <div className="card overflow-hidden pb-1.5 lg:col-span-2">
          <CardHeader title="Recent leads">
            <Link href="/leads" className="text-[13px] font-medium text-accent hover:underline">
              See all
            </Link>
          </CardHeader>
          {recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No leads yet. They’ll show up here as soon as they arrive.
            </p>
          ) : (
            <ul>
              {recent.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}?from=%2Fdashboard`}
                    className="flex items-center gap-3 px-5 py-2 transition-colors hover:bg-surface-2"
                  >
                    <Avatar name={fullName(lead)} className="h-8 w-8" />
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
