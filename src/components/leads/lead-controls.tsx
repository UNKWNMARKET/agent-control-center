"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { LEAD_STATUSES, STATUS_META } from "@/lib/leads";
import { setLeadStatus, assignLead, deleteLead } from "@/app/actions/leads";
import { openSaleDialog } from "@/lib/open-sale";

export function StatusControl({
  leadId,
  status,
}: {
  leadId: string;
  status: LeadStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refused, setRefused] = useState<string | null>(null);

  const change = (next: LeadStatus) => {
    setRefused(null);
    // Sold is the one status that can't just be set: it needs the carrier,
    // the policy number and the paperwork. Reaching for it here opens those
    // questions rather than telling the agent to go and find another button.
    if (next === "SOLD") {
      openSaleDialog();
      return;
    }
    start(async () => {
      const res = await setLeadStatus(leadId, next);
      if (!res.ok) {
        setRefused(res.message ?? "That change wasn't allowed.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value as LeadStatus)}
        className="input w-auto min-w-[150px] font-medium"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      {refused ? <p className="mt-1 max-w-[220px] text-xs text-warning">{refused}</p> : null}
    </div>
  );
}

export function AssignControl({
  leadId,
  assignedToId,
  users,
}: {
  leadId: string;
  assignedToId: string | null;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <select
      value={assignedToId ?? ""}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          await assignLead(leadId, e.target.value);
          router.refresh();
        })
      }
      className="input w-auto min-w-[160px]"
    >
      <option value="">Unassigned</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}

export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this lead permanently? This cannot be undone.")) return;
        start(async () => {
          await deleteLead(leadId);
        });
      }}
      className="btn btn-danger"
    >
      <Trash2 size={15} /> {pending ? "Deleting…" : "Delete lead"}
    </button>
  );
}
