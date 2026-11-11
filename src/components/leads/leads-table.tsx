"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Trash2, CalendarClock, Tag } from "lucide-react";
import type { LeadStatus, DncStatus } from "@prisma/client";
import { StatusBadge, EmptyState } from "@/components/ui";
import { DncDot } from "@/components/dnc-dot";
import { ScoreBadge } from "@/components/score-badge";
import { leadScore } from "@/lib/score";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { fullName, timeAgo, cn } from "@/lib/utils";
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
        days < 0 ? "bg-fill text-faint" : urgent ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
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

  const chips = (r: Row) => (
    <>
      {r.ownership ? <OwnershipChip ownership={r.ownership} homestead={r.homestead} /> : null}
      {r.policyExpiresAt ? <XDateChip date={r.policyExpiresAt} /> : null}
      {r.followUpAt ? <FollowUpChip date={r.followUpAt} /> : null}
      {r.tags.map((t) => (
        <span
          key={t}
          className="rounded bg-fill px-1.5 py-0.5 text-[0.65rem] font-medium text-muted"
        >
          {t}
        </span>
      ))}
    </>
  );

  const hasChips = (r: Row) =>
    Boolean(r.ownership || r.policyExpiresAt || r.followUpAt || r.tags.length);

  return (
    <div className="card overflow-hidden">
      {/* Bulk action bar */}
      {isAdmin && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2.5">
          <span className="mr-auto text-sm font-medium text-accent">
            {selected.size} selected
          </span>
          <select
            defaultValue=""
            disabled={pending}
            aria-label="Assign selected leads"
            onChange={(e) => {
              if (e.target.value !== "") runAssign(e.target.value === "__none" ? "" : e.target.value);
              e.target.value = "";
            }}
            className="input w-auto bg-surface"
          >
            <option value="" disabled>
              Assign to…
            </option>
            <option value="__none">Nobody (unassign)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            disabled={pending}
            aria-label="Set status of selected leads"
            onChange={(e) => {
              if (e.target.value !== "") runStatus(e.target.value as LeadStatus);
              e.target.value = "";
            }}
            className="input w-auto bg-surface"
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
          <div className="relative">
            <Tag
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              placeholder="Add tag, press Enter"
              aria-label="Tag selected leads"
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
              className="input w-44 bg-surface pl-8"
            />
          </div>
          <button onClick={runDelete} disabled={pending} className="btn btn-danger">
            <Trash2 size={15} /> Delete
          </button>
          {refused ? <p className="w-full text-xs text-warning">{refused}</p> : null}
        </div>
      ) : null}

      {/* Phone: one lead per row, the whole row tappable. */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => {
          const isSel = selected.has(r.id);
          return (
            <li
              key={r.id}
              onClick={() => router.push(leadHref(r.id))}
              className={cn(
                "flex cursor-pointer items-start gap-3 px-4 py-3 active:bg-surface-2",
                isSel && "bg-accent-soft",
              )}
            >
              {isAdmin ? (
                <span className="-m-2 p-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${fullName(r)}`}
                    className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
                  />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-medium text-ink">{fullName(r)}</p>
                  <span className="shrink-0 text-xs text-faint">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                  <DncDot status={r.dncStatus} reason={r.dncReason} className="h-2 w-2" />
                  <CallLink phone={r.phone} app={phoneApp} leadId={r.id} stopRowClick />
                  {r.product ? <span>· {r.product}</span> : null}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={r.status} />
                  <ScoreBadge {...leadScore(r)} />
                  {chips(r)}
                </div>
              </div>
              <ChevronRight size={16} className="mt-1 shrink-0 text-faint" />
            </li>
          );
        })}
      </ul>

      {/* Desk: the full table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-faint">
              {isAdmin ? (
                <th className="w-10 py-2.5 pl-5 pr-1">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                </th>
              ) : null}
              <th className={cn("px-3 py-2.5 font-medium", !isAdmin && "pl-5")}>Name</th>
              <th className="px-3 py-2.5 font-medium">Contact</th>
              <th className="px-3 py-2.5 font-medium">Interest</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Priority</th>
              {isAdmin ? <th className="px-3 py-2.5 font-medium">Assigned</th> : null}
              <th className="py-2.5 pl-3 pr-5 text-right font-medium">Added</th>
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
                    isSel && "bg-accent-soft hover:bg-accent-soft",
                  )}
                >
                  {isAdmin ? (
                    <td className="py-2.5 pl-5 pr-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select ${fullName(r)}`}
                        className="h-4 w-4 accent-[var(--color-accent)]"
                      />
                    </td>
                  ) : null}
                  <td className={cn("px-3 py-2.5", !isAdmin && "pl-5")}>
                    <p className="font-medium text-ink">{fullName(r)}</p>
                    {hasChips(r) ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">{chips(r)}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="flex items-center gap-1.5 whitespace-nowrap text-ink-2">
                      <DncDot status={r.dncStatus} reason={r.dncReason} className="h-2 w-2" />
                      <CallLink phone={r.phone} app={phoneApp} leadId={r.id} stopRowClick />
                      <TextLink phone={r.phone} app={phoneApp} leadId={r.id} stopRowClick />
                    </p>
                    {r.email ? (
                      <p className="max-w-[220px] truncate text-xs text-faint">
                        <MailLink email={r.email} client={mailClient} stopRowClick />
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-ink-2">{r.product ?? "—"}</p>
                    {r.source ? <p className="text-xs text-faint">{r.source}</p> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreBadge {...leadScore(r)} />
                  </td>
                  {isAdmin ? (
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">
                      {r.assignedToName ?? <span className="text-warning">Unassigned</span>}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap py-2.5 pl-3 pr-5 text-right text-faint">
                    {timeAgo(r.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn btn-secondary">
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="btn btn-secondary">
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
