"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/** The filters that live behind the Filters button. Stage and search don't. */
const EXTRA_KEYS = ["vendor", "dnc", "followup", "xdate", "tag", "assignee"] as const;

/**
 * Narrowing the list.
 *
 * The two things people reach for constantly — which stage, and a name or
 * number — are always on screen. The six that are used now and then sit
 * behind one button, which counts how many are switched on so a filtered
 * list is never mistaken for the whole one.
 */
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
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // A search arriving from elsewhere (the sidebar) shows up in the box.
  const urlQ = params.get("q") ?? "";
  const lastUrlQ = useRef(urlQ);
  useEffect(() => {
    if (urlQ !== lastUrlQ.current) {
      lastUrlQ.current = urlQ;
      setQ(urlQ);
    }
  }, [urlQ]);

  // Debounce the search input -> URL.
  useEffect(() => {
    if (q === urlQ) return;
    const t = setTimeout(() => {
      lastUrlQ.current = q;
      update("q", q);
    }, 350);
    return () => clearTimeout(t);
  }, [q, urlQ, update]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const status = params.get("status") ?? "";
  const value = (k: string) => params.get(k) ?? "";
  const extraCount = EXTRA_KEYS.filter((k) => params.get(k)).length;
  const hasAny = Boolean(q || status || extraCount);

  const clearExtras = () => {
    const next = new URLSearchParams(params.toString());
    for (const k of EXTRA_KEYS) next.delete(k);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="mb-4 space-y-3">
      {/* Stage */}
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="segmented" role="tablist" aria-label="Stage">
          <button
            role="tab"
            aria-selected={status === ""}
            data-active={status === ""}
            onClick={() => update("status", "")}
            className="segment"
          >
            Active
          </button>
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              data-active={status === s}
              onClick={() => update("status", s)}
              className="segment"
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Search + everything else */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, email, city or policy"
            aria-label="Search leads"
            className="input pl-9"
          />
          {q ? (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-fill-2 text-muted hover:text-ink"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={cn("btn", extraCount ? "btn-ghost bg-accent-soft" : "btn-secondary")}
          >
            <SlidersHorizontal size={15} />
            Filters
            {extraCount ? (
              <span className="tabular rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-[18px] text-on-accent">
                {extraCount}
              </span>
            ) : null}
          </button>

          {open ? (
            <div
              role="dialog"
              aria-label="Filters"
              className="popover absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] p-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <FilterSelect label="Source" value={value("vendor")} onChange={(v) => update("vendor", v)}>
                  <option value="">All sources</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect label="Compliance" value={value("dnc")} onChange={(v) => update("dnc", v)}>
                  <option value="">Any</option>
                  <option value="OK">OK to call</option>
                  <option value="BLOCKED">Do Not Call</option>
                  <option value="UNKNOWN">Not checked</option>
                </FilterSelect>

                <FilterSelect label="Follow-up" value={value("followup")} onChange={(v) => update("followup", v)}>
                  <option value="">Any</option>
                  <option value="due">Due now</option>
                  <option value="scheduled">Scheduled</option>
                </FilterSelect>

                <FilterSelect
                  label="Current policy expires"
                  value={value("xdate")}
                  onChange={(v) => update("xdate", v)}
                >
                  <option value="">Any time</option>
                  <option value="30">Within 30 days</option>
                  <option value="60">Within 60 days</option>
                  <option value="90">Within 90 days</option>
                  <option value="past">Already passed</option>
                </FilterSelect>

                {tags.length > 0 ? (
                  <FilterSelect label="Tag" value={value("tag")} onChange={(v) => update("tag", v)}>
                    <option value="">All tags</option>
                    {tags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </FilterSelect>
                ) : null}

                {isAdmin ? (
                  <FilterSelect
                    label="Assigned to"
                    value={value("assignee")}
                    onChange={(v) => update("assignee", v)}
                  >
                    <option value="">Anyone</option>
                    <option value="unassigned">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </FilterSelect>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={clearExtras}
                  disabled={!extraCount}
                  className="text-[13px] font-medium text-accent disabled:text-faint"
                >
                  Reset filters
                </button>
                <button onClick={() => setOpen(false)} className="btn btn-primary">
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {hasAny ? (
          <button
            onClick={() => {
              setQ("");
              lastUrlQ.current = "";
              router.replace(pathname);
            }}
            className="btn btn-ghost hidden sm:inline-flex"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("input", value && "border-accent bg-accent-soft")}
      >
        {children}
      </select>
    </label>
  );
}
