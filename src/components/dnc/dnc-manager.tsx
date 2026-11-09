"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PhoneOff, RefreshCw } from "lucide-react";
import { addDncNumbers, removeDncNumber, rescrubAllLeads } from "@/app/actions/dnc";
import type { ActionState } from "@/app/actions/users";
import { EmptyState } from "@/components/ui";
import { formatPhone, formatDate } from "@/lib/utils";

type Entry = {
  id: string;
  phone: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
};

export function DncManager({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [rechecking, startRecheck] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button
          onClick={() =>
            startRecheck(async () => {
              const n = await rescrubAllLeads();
              router.refresh();
              alert(`Re-checked ${n} lead${n === 1 ? "" : "s"} against your Do-Not-Call list.`);
            })
          }
          disabled={rechecking}
          className="btn btn-secondary"
        >
          <RefreshCw size={16} /> {rechecking ? "Re-checking…" : "Re-check all leads"}
        </button>
        <button onClick={() => setShowAdd((v) => !v)} className="btn btn-primary">
          <Plus size={16} /> Add numbers
        </button>
      </div>

      {showAdd ? <AddForm onDone={() => setShowAdd(false)} /> : null}

      {entries.length === 0 ? (
        <EmptyState
          icon={<PhoneOff size={26} />}
          title="No numbers on your Do-Not-Call list"
          description="Add numbers here, or use “Add to Do-Not-Call” on any lead. New leads with these numbers are flagged red automatically."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-4 py-3">Number</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3">Added by</th>
                <th className="px-3 py-3">Added</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    addDncNumbers,
    undefined,
  );

  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label">Phone numbers</label>
        <textarea
          name="numbers"
          required
          rows={3}
          placeholder="Paste one or more numbers — any format, separated by commas, spaces, or new lines"
          className="input resize-y font-mono"
        />
      </div>
      <div>
        <label className="label">Reason (optional)</label>
        <input
          name="reason"
          className="input"
          placeholder="e.g. Customer requested no contact"
        />
      </div>

      {state?.error ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-xl bg-positive-soft px-3.5 py-2.5 text-sm font-medium text-positive">
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="btn btn-secondary">
          Done
        </button>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding…" : "Add to Do-Not-Call"}
        </button>
      </div>
    </form>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-3 font-medium text-ink">{formatPhone(entry.phone)}</td>
      <td className="px-3 py-3 text-ink-2">{entry.reason ?? "—"}</td>
      <td className="px-3 py-3 text-muted">{entry.createdBy ?? "—"}</td>
      <td className="px-3 py-3 text-faint">{formatDate(entry.createdAt)}</td>
      <td className="px-3 py-3 text-right">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              await removeDncNumber(entry.phone);
              router.refresh();
            })
          }
          className="rounded-full p-2 text-danger hover:bg-danger-soft"
          title="Remove from list"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}
