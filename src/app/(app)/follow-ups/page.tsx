import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader, EmptyState, StatusBadge, Avatar } from "@/components/ui";
import { fullName, formatPhone, formatDate, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Follow-ups · Agent Control Center" };

export default async function FollowUpsPage() {
  const user = await requireUser();
  const scope = user.role === "ADMIN" ? {} : { assignedToId: user.id };

  const leads = await db.lead.findMany({
    where: { ...scope, followUpAt: { not: null } },
    orderBy: { followUpAt: "asc" },
    include: { assignedTo: true },
  });

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const tomorrowKey = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const weekEndKey = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const buckets: Record<string, typeof leads> = {
    overdue: [], today: [], tomorrow: [], week: [], later: [],
  };
  for (const l of leads) {
    const k = l.followUpAt!.toISOString().slice(0, 10);
    if (k < todayKey) buckets.overdue.push(l);
    else if (k === todayKey) buckets.today.push(l);
    else if (k === tomorrowKey) buckets.tomorrow.push(l);
    else if (k <= weekEndKey) buckets.week.push(l);
    else buckets.later.push(l);
  }

  const sections = [
    { key: "overdue", title: "Overdue", accent: "text-danger" },
    { key: "today", title: "Today", accent: "text-accent" },
    { key: "tomorrow", title: "Tomorrow", accent: "text-ink" },
    { key: "week", title: "This week", accent: "text-ink" },
    { key: "later", title: "Later", accent: "text-muted" },
  ];

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        subtitle={`${leads.length} scheduled${user.role === "ADMIN" ? " across the team" : ""}`}
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={26} />}
          title="No follow-ups scheduled"
          description="Set a follow-up date on any lead and it’ll show up here, grouped by when it’s due."
        />
      ) : (
        <div className="space-y-5">
          {sections.map((s) => {
            const items = buckets[s.key];
            if (items.length === 0) return null;
            return (
              <div key={s.key}>
                <h2 className={cn("mb-2 text-sm font-semibold", s.accent)}>
                  {s.title} <span className="text-faint">· {items.length}</span>
                </h2>
                <div className="card divide-y divide-line overflow-hidden">
                  {items.map((l) => (
                    <Link
                      key={l.id}
                      href={`/leads/${l.id}?from=%2Ffollow-ups`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                    >
                      <Avatar name={fullName(l)} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{fullName(l)}</p>
                        <p className="truncate text-xs text-muted">
                          {formatPhone(l.phone)}
                          {l.assignedTo ? ` · ${l.assignedTo.name}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={l.status} />
                      <span className="w-20 shrink-0 text-right text-xs font-medium text-muted">
                        {formatDate(l.followUpAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
