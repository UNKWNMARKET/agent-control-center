"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Copy, Check, Pause, Play, AlertTriangle, Link2, X,
} from "lucide-react";
import { createAgency, setAgencyStatus, recordPayment } from "@/app/actions/agencies";

type Agency = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  monthlyFee: number | null;
  paidThrough: string | null;
  billingNotes: string | null;
  users: number;
  leads: number;
  policies: number;
  pendingInvites: { id: string; email: string; name: string; expiresAt: string }[];
};

/** Paid up, due, or overdue — the only question worth answering at a glance. */
function billingState(paidThrough: string | null) {
  if (!paidThrough) return { label: "No payment recorded", tone: "warn" as const };
  const days = Math.round((new Date(`${paidThrough}T12:00:00`).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, tone: "bad" as const };
  if (days <= 7) return { label: `Due in ${days}d`, tone: "warn" as const };
  return { label: `Paid to ${paidThrough}`, tone: "good" as const };
}

export function OwnerConsole({ agencies }: { agencies: Agency[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      setMessage(null);
      const res = await createAgency(fd);
      if (!res.ok) {
        setError(res.message ?? "That didn't work.");
        return;
      }
      setMessage(res.message ?? "Created.");
      setLink(res.inviteLink ?? null);
      setAdding(false);
      router.refresh();
    });

  const toggle = (a: Agency) =>
    start(async () => {
      const res = await setAgencyStatus(a.id, a.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
      setMessage(res.message ?? null);
      router.refresh();
    });

  const pay = (id: string, fd: FormData) =>
    start(async () => {
      const res = await recordPayment(id, fd);
      setMessage(res.message ?? null);
      setOpenId(null);
      router.refresh();
    });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {message ? <p className="text-sm text-positive">{message}</p> : null}
          {error ? (
            <p className="flex gap-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
        <button onClick={() => setAdding((v) => !v)} className="btn btn-primary shrink-0">
          <Plus size={16} /> New agency
        </button>
      </div>

      {/* The invite link, handed back so it can be passed on directly when
          the email goes astray. */}
      {link ? (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
          <Link2 size={16} className="text-accent" />
          <code className="min-w-0 flex-1 truncate text-xs text-ink-2">{link}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn btn-secondary py-1.5"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button onClick={() => setLink(null)} className="text-faint hover:text-ink" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {adding ? (
        <form action={submit} className="card mb-4 grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Agency name</label>
            <input name="name" className="input" placeholder="Smith Insurance Group" required autoFocus />
            <p className="mt-1.5 text-xs text-faint">
              This is what their staff see in the corner of every page.
            </p>
          </div>
          <div>
            <label className="label">Their admin</label>
            <input name="adminName" className="input" placeholder="Pat Smith" required />
          </div>
          <div>
            <label className="label">Admin email</label>
            <input name="adminEmail" type="email" className="input" placeholder="pat@smithins.com" required />
          </div>
          <div>
            <label className="label">Monthly fee</label>
            <input name="monthlyFee" className="input" placeholder="199" inputMode="decimal" />
          </div>
          <div>
            <label className="label">Billing notes</label>
            <input name="billingNotes" className="input" placeholder="Zelle, 1st of the month" />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setAdding(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Creating…" : "Create and invite"}
            </button>
          </div>
        </form>
      ) : null}

      {agencies.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-muted">
            No agencies yet. Create one and their admin gets a link to set their own password.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {agencies.map((a) => {
            const bill = billingState(a.paidThrough);
            return (
              <div key={a.id} className="p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                      {a.status === "SUSPENDED" ? (
                        <span className="chip bg-danger-soft text-danger">Suspended</span>
                      ) : null}
                      <span
                        className={
                          bill.tone === "good"
                            ? "chip bg-positive-soft text-positive"
                            : bill.tone === "warn"
                              ? "chip bg-warning-soft text-warning"
                              : "chip bg-danger-soft text-danger"
                        }
                      >
                        {bill.label}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted">
                      {a.users} {a.users === 1 ? "person" : "people"} · {a.leads} leads ·{" "}
                      {a.policies} policies
                      {a.monthlyFee != null ? ` · $${a.monthlyFee}/mo` : ""}
                      {a.billingNotes ? ` · ${a.billingNotes}` : ""}
                    </p>
                  </div>

                  <button
                    onClick={() => setOpenId(openId === a.id ? null : a.id)}
                    className="btn btn-secondary py-1.5 text-xs"
                  >
                    Record payment
                  </button>
                  <button
                    onClick={() => toggle(a)}
                    disabled={pending}
                    className="btn btn-secondary py-1.5 text-xs"
                  >
                    {a.status === "ACTIVE" ? <Pause size={13} /> : <Play size={13} />}
                    {a.status === "ACTIVE" ? "Suspend" : "Restore"}
                  </button>
                </div>

                {a.pendingInvites.length > 0 ? (
                  <p className="mt-2 text-xs text-faint">
                    Waiting on:{" "}
                    {a.pendingInvites.map((i) => `${i.name} (${i.email})`).join(", ")}
                  </p>
                ) : null}

                {openId === a.id ? (
                  <form
                    action={(fd) => pay(a.id, fd)}
                    className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-surface-2 p-3"
                  >
                    <div>
                      <label className="label">Paid through</label>
                      <input
                        name="paidThrough"
                        type="date"
                        defaultValue={a.paidThrough ?? ""}
                        className="input w-auto"
                      />
                    </div>
                    <div className="min-w-[180px] flex-1">
                      <label className="label">Notes</label>
                      <input
                        name="billingNotes"
                        defaultValue={a.billingNotes ?? ""}
                        className="input"
                        placeholder="Zelle 11/9"
                      />
                    </div>
                    <button type="submit" disabled={pending} className="btn btn-primary">
                      Save
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-faint">
        Suspending stops their logins and refuses new leads from their sources. Nothing is
        deleted, and restoring puts them straight back.
      </p>
    </div>
  );
}
