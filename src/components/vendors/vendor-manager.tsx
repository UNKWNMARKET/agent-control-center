"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Webhook,
  Power,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/actions/users";
import {
  createVendor,
  toggleVendorActive,
  regenerateVendorToken,
  deleteVendor,
  updateVendorCost,
} from "@/app/actions/vendors";

type Vendor = {
  id: string;
  name: string;
  slug: string;
  webhookToken: string;
  active: boolean;
  costPerLead: number | null;
  leadCount: number;
};

export function VendorManager({
  vendors,
  appUrl,
}: {
  vendors: Vendor[];
  appUrl: string;
}) {
  const router = useRouter();
  const [base, setBase] = useState(appUrl);
  const [showAdd, setShowAdd] = useState(false);

  // Fall back to the current origin if NEXT_PUBLIC_APP_URL isn't set.
  useEffect(() => {
    if (!base && typeof window !== "undefined") setBase(window.location.origin);
  }, [base]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd((v) => !v)} className="btn btn-primary">
          <Plus size={16} /> Add source
        </button>
      </div>

      {showAdd ? <AddVendorForm onDone={() => setShowAdd(false)} /> : null}

      <div className="grid grid-cols-1 gap-3">
        {vendors.map((v) => (
          <VendorCard
            key={v.id}
            vendor={v}
            base={base}
            onChange={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function AddVendorForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createVendor,
    undefined,
  );
  if (state?.ok) setTimeout(onDone, 500);

  return (
    <form action={action} className="card flex flex-wrap items-end gap-3 p-5">
      <div className="min-w-[220px] flex-1">
        <label className="label">Lead source name</label>
        <input name="name" required className="input" placeholder="e.g. QuoteWizard" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={onDone} className="btn btn-secondary">
        Cancel
      </button>
      {state?.error ? (
        <p className="w-full rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function VendorCard({
  vendor,
  base,
  onChange,
}: {
  vendor: Vendor;
  base: string;
  onChange: () => void;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  const url = `${base}/api/webhooks/${vendor.slug}?token=${vendor.webhookToken}`;

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
        onChange();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Webhook size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{vendor.name}</p>
          <p className="text-xs text-muted">
            {vendor.leadCount} {vendor.leadCount === 1 ? "lead" : "leads"} received
          </p>
        </div>
        <span
          className={cn(
            "chip",
            vendor.active ? "bg-positive-soft text-positive" : "bg-black/5 text-muted",
          )}
        >
          {vendor.active ? "Active" : "Disabled"}
        </span>
      </div>

      <div className="mt-4">
        <label className="label">Webhook URL — paste this into {vendor.name}</label>
        <div className="flex items-stretch gap-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-xl bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink-2">
            {url}
          </code>
          <button onClick={copy} className="btn btn-secondary shrink-0">
            {copied ? <Check size={15} className="text-positive" /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-faint">
          Leads sent to this URL (POST) appear instantly in your dashboard. Keep it secret.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="label mb-0">Cost per lead</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">
            $
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            defaultValue={vendor.costPerLead ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              run(() => updateVendorCost(vendor.id, v ? Number(v) : null));
            }}
            className="input w-28 py-1.5 pl-6 text-sm"
            placeholder="0.00"
          />
        </div>
        <span className="text-xs text-faint">powers ROI in Reports</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <button
          disabled={pending}
          onClick={() => run(() => toggleVendorActive(vendor.id))}
          className="btn btn-secondary py-1.5"
        >
          <Power size={14} /> {vendor.active ? "Disable" : "Enable"}
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm("Regenerate the token? The old webhook URL will stop working."))
              run(() => regenerateVendorToken(vendor.id));
          }}
          className="btn btn-secondary py-1.5"
        >
          <RefreshCw size={14} /> Regenerate token
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete ${vendor.name}? Existing leads are kept but lose their source link.`))
              run(() => deleteVendor(vendor.id));
          }}
          className="btn btn-danger py-1.5"
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}
