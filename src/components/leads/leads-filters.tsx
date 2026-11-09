"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";

type Option = { id: string; name: string };

export function LeadsFilters({
  vendors,
  users,
  tags,
  isAdmin,
}: {
  vendors: Option[];
  users: Option[];
  tags: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  // Debounce the search input -> URL.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => update("q", q), 350);
    return () => clearTimeout(t);
  }, [q, params, update]);

  const status = params.get("status") ?? "";
  const vendor = params.get("vendor") ?? "";
  const assignee = params.get("assignee") ?? "";
  const dnc = params.get("dnc") ?? "";
  const followup = params.get("followup") ?? "";
  const tag = params.get("tag") ?? "";
  const xdate = params.get("xdate") ?? "";
  const hasFilters = Boolean(q || status || vendor || assignee || dnc || followup || tag || xdate);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, email, city…"
          className="input pl-9"
        />
      </div>

      <select
        value={status}
        onChange={(e) => update("status", e.target.value)}
        className="input w-auto min-w-[130px]"
      >
        <option value="">All but lost</option>
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>

      <select
        value={vendor}
        onChange={(e) => update("vendor", e.target.value)}
        className="input w-auto min-w-[130px]"
      >
        <option value="">All sources</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>

      <select
        value={dnc}
        onChange={(e) => update("dnc", e.target.value)}
        className="input w-auto min-w-[140px]"
      >
        <option value="">Any compliance</option>
        <option value="OK">🟢 OK to call</option>
        <option value="BLOCKED">🔴 Do Not Call</option>
        <option value="UNKNOWN">⚪ Not checked</option>
      </select>

      <select
        value={followup}
        onChange={(e) => update("followup", e.target.value)}
        className="input w-auto min-w-[140px]"
      >
        <option value="">Any follow-up</option>
        <option value="due">Follow-up due</option>
        <option value="scheduled">Has follow-up</option>
      </select>

      <select
        value={xdate}
        onChange={(e) => update("xdate", e.target.value)}
        className="input w-auto min-w-[150px]"
        title="When their current policy expires"
      >
        <option value="">Any X-date</option>
        <option value="30">X-date ≤ 30 days</option>
        <option value="60">X-date ≤ 60 days</option>
        <option value="90">X-date ≤ 90 days</option>
        <option value="past">X-date passed</option>
      </select>

      {tags.length > 0 ? (
        <select
          value={tag}
          onChange={(e) => update("tag", e.target.value)}
          className="input w-auto min-w-[120px]"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      ) : null}

      {isAdmin ? (
        <select
          value={assignee}
          onChange={(e) => update("assignee", e.target.value)}
          className="input w-auto min-w-[140px]"
        >
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      ) : null}

      {hasFilters ? (
        <button
          onClick={() => {
            setQ("");
            router.replace(pathname);
          }}
          className="btn btn-secondary"
        >
          <X size={15} /> Clear
        </button>
      ) : null}
    </div>
  );
}
