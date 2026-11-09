"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitMerge } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { mergeLeads } from "@/app/actions/dedup";
import { StatusBadge } from "@/components/ui";
import { formatPhone, formatDate, cn } from "@/lib/utils";

type DupLead = {
  id: string;
  name: string;
  email: string | null;
  source: string | null;
  status: LeadStatus;
  assignedToName: string | null;
  activityCount: number;
  createdAt: string;
};
type Group = { phone: string; leads: DupLead[] };

export function DedupClient({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <GroupCard key={g.phone} group={g} />
      ))}
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const router = useRouter();
  const [primary, setPrimary] = useState(group.leads[0].id);
  const [pending, start] = useTransition();

  const merge = () =>
    start(async () => {
      if (
        !confirm(
          `Merge these ${group.leads.length} leads into one? The others are deleted and their history is kept on the lead you chose.`,
        )
      )
        return;
      await mergeLeads(primary, group.leads.map((l) => l.id));
      router.refresh();
    });

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          {formatPhone(group.phone)}
          <span className="font-normal text-muted"> · {group.leads.length} leads</span>
        </p>
        <button onClick={merge} disabled={pending} className="btn btn-primary py-1.5">
          <GitMerge size={15} /> {pending ? "Merging…" : "Merge"}
        </button>
      </div>
      <div className="space-y-2">
        {group.leads.map((l) => (
          <label
            key={l.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
              primary === l.id ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-2",
            )}
          >
            <input
              type="radio"
              name={`primary-${group.phone}`}
              checked={primary === l.id}
              onChange={() => setPrimary(l.id)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {l.name}
                {primary === l.id ? (
                  <span className="ml-1.5 text-xs font-semibold text-accent">keep</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted">
                {l.email ?? "no email"} · {l.source ?? "—"} ·{" "}
                {l.assignedToName ?? "Unassigned"} · {l.activityCount} activities ·{" "}
                {formatDate(l.createdAt)}
              </p>
            </div>
            <StatusBadge status={l.status} />
          </label>
        ))}
      </div>
    </div>
  );
}
