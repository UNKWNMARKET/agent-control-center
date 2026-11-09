"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Trash2, UserCheck, CalendarClock, Tag } from "lucide-react";
import type { LeadStatus, DncStatus } from "@prisma/client";
import { StatusBadge, Avatar, EmptyState } from "@/components/ui";
import { DncDot } from "@/components/dnc-dot";
import { ScoreBadge } from "@/components/score-badge";
import { leadScore } from "@/lib/score";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { fullName, formatPhone, timeAgo, cn } from "@/lib/utils";
import type { MailClient } from "@/lib/mail";
import type { Ownership } from "@/lib/property";
import type { PhoneApp } from "@/lib/phone";
import { MailLink } from "@/components/mail-link";
import { CallLink, TextLink } from "@/components/phone-links";
import { OwnershipChip } from "@/components/leads/property-panel";
import { bulkAssign, bulkDelete, bulkSetStatus, bulkAddTag } from "@/app/actions/leads";

/** The X-date is when they can actually switch — flag it as it gets close. */
function XDateChip({ date }: { date: string }) {
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (days > 90) return null;
  const urgent = days <= 30;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
        days < 0 ? "bg-black/5 text-faint" : urgent ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
      )}
      title={`Current policy expires ${new Date(date).toLocaleDateString("en-US", { timeZone: "UTC" })}`}
    >
      <CalendarClock size={11} />
      {days < 0 ? "X-date passed" : `X-date ${days}d`}
    </span>
  );
}

function FollowUpChip({ date }: { date: string }) {
  const d = new Date(date);
  const overdue = d.getTime() <= Date.now();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
        overdue ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
      )}
      title={overdue ? "Follow-up overdue" : "Follow-up scheduled"}
    >
      <CalendarClock size={11} />
      {d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
    </span>
  );
}

type Row = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  product: string | null;
  status: LeadStatus;
  source: string | null;
  state: string | null;
  assignedToName: string | null;
  dncStatus: DncStatus;
  dncReason: string | null;
  tags: string[];
  ownership: Ownership | null;
  homestead: boolean;
  policyExpiresAt: string | null;
  followUpAt: string | null;
  contactedAt: string | null;
  createdAt: string;
};

export function LeadsTable({
  rows,
  users,
  isAdmin,
  page,
  totalPages,
  mailClient,
  phoneApp,
}: {
  rows: Row[];
  users: { id: string; name: string }[];
  isAdmin: boolean;
  page: number;
  totalPages: number;
  total: number;
  mailClient: MailClient;
  phoneApp: PhoneApp;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refused, setRefused] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const ids = [...selected];

  const runAssign = (assigneeId: string) =>
    startTransition(async () => {
      await bulkAssign(ids, assigneeId);
      setSelected(new Set());
      router.refresh();
    });

  const runDelete = () =>
    startTransition(async () => {
      if (!confirm(`Delete ${ids.length} lead(s)? This cannot be undone.`)) return;
      await bulkDelete(ids);
      setSelected(new Set());
      router.refresh();
    });

  const runStatus = (status: LeadStatus) =>
    startTransition(async () => {
      setRefused(null);
      const res = await bulkSetStatus(ids, status);
      // A partial result still reports what it skipped and why.
      if (res.message) setRefused(res.message);
      if (!res.ok) return;
      setSelected(new Set());
      router.refresh();
    });

  const runTag = (tag: string) =>
    startTransition(async () => {
      await bulkAddTag(ids, tag);
      setSelected(new Set());
      router.refresh();
    });

  /** Current list view, so a lead can send the agent back to exactly this. */
  const listHref = `${pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  const leadHref = (id: string) => `/leads/${id}?from=${encodeURIComponent(listHref)}`;

  const pageHref = (p: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(p));
    return `${pathname}?${next.toString()}`;
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No leads found"
        description="Try adjusting your filters, importing a file, or connecting a lead source."
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Bulk action bar */}
      {isAdmin && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-accent-soft px-4 py-2.5">
          <span className="text-sm font-medium text-accent">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <UserCheck size={15} className="text-accent" />
              <select
                defaultValue=""
                disabled={pending}
                onChange={(e) => {
                  if (e.target.value !== "") runAssign(e.target.value);
                  e.target.value = "";
                }}
                className="input w-auto py-1.5 text-sm"
              >
                <option value="" disabled>
                  Assign to…
                </option>
                <option value="">Unassign</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <select
              defaultValue=""
              disabled={pending}
              onChange={(e) => {
                if (e.target.value !== "") runStatus(e.target.value as LeadStatus);
                e.target.value = "";
              }}
              className="input w-auto py-1.5 text-sm"
            >
              <option value="" disabled>
                Set status…
              </option>
              {/* Sold isn't offered here — it goes through Mark sold, which
                  collects the paperwork and creates the policy. */}
              {LEAD_STATUSES.filter((s) => s !== "SOLD").map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <Tag size={15} className="text-accent" />
              <input
                placeholder="Add tag…"
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.target as HTMLInputElement).value.trim();
                    if (v) {
                      runTag(v);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
                className="input w-24 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={runDelete}
              disabled={pending}
              className="btn btn-danger py-1.5"
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
          {refused ? (
            <p className="w-full text-xs text-warning">{refused}</p>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
              {isAdmin ? (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                </th>
              ) : null}
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Contact</th>
              <th className="px-3 py-3 font-semibold">Product</th>
              <th className="px-3 py-3 font-semibold">Source</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Priority</th>
              {isAdmin ? <th className="px-3 py-3 font-semibold">Assigned</th> : null}
              <th className="px-3 py-3 font-semibold">Added</th>
              <th className="w-8 px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(leadHref(r.id))}
                  className={cn(
                    "cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-surface-2",
                    isSel && "bg-accent-soft/50",
                  )}
                >
                  {isAdmin ? (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={fullName(r)} className="h-8 w-8" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{fullName(r)}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                          {r.state ? <span className="text-faint">{r.state}</span> : null}
                          {r.ownership ? (
                            <OwnershipChip ownership={r.ownership} homestead={r.homestead} />
                          ) : null}
                          {r.policyExpiresAt ? <XDateChip date={r.policyExpiresAt} /> : null}
                          {r.followUpAt ? <FollowUpChip date={r.followUpAt} /> : null}
                          {r.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-info-soft px-1.5 py-0.5 text-[0.65rem] font-medium text-info"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="flex items-center gap-1.5 text-ink-2">
                      <DncDot status={r.dncStatus} reason={r.dncReason} />
                      <CallLink phone={r.phone} app={phoneApp} leadId={r.id} stopRowClick />
                      <TextLink phone={r.phone} app={phoneApp} leadId={r.id} stopRowClick />
                    </p>
                    {r.email ? (
                      <p className="truncate text-xs text-faint">
                        <MailLink
                          email={r.email}
                          client={mailClient}
                          stopRowClick
                        />
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-ink-2">{r.product ?? "—"}</td>
                  <td className="px-3 py-3 text-ink-2">{r.source ?? "—"}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBadge {...leadScore(r)} />
                  </td>
                  {isAdmin ? (
                    <td className="px-3 py-3 text-ink-2">
                      {r.assignedToName ?? (
                        <span className="text-warning">Unassigned</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-3 py-3 text-faint">{timeAgo(r.createdAt)}</td>
                  <td className="px-3 py-3 text-faint">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn btn-secondary py-1.5">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="btn btn-secondary py-1.5">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
