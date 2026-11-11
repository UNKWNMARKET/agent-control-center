"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Copy, Check, X, Link2, AlertTriangle, Clock } from "lucide-react";
import { inviteStaff, revokeInvite } from "@/app/actions/agencies";

type Invite = {
  id: string;
  name: string;
  email: string;
  role: string;
  expiresAt: string;
  expired: boolean;
};

/**
 * Bringing someone onto the team.
 *
 * No password is set here and none is emailed. They follow a link and choose
 * their own, so nobody — including whoever invited them — ever knows it.
 */
export function InviteStaff({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = (fd: FormData) =>
    start(async () => {
      setError(null);
      const res = await inviteStaff(fd);
      if (!res.ok) {
        setError(res.message ?? "That didn't work.");
        return;
      }
      setLink(res.inviteLink ?? null);
      setOpen(false);
      router.refresh();
    });

  const revoke = (id: string) =>
    start(async () => {
      await revokeInvite(id);
      router.refresh();
    });

  return (
    <div className="mb-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {error ? (
            <p className="flex gap-2 text-sm text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="btn btn-primary shrink-0">
          <UserPlus size={16} /> Invite someone
        </button>
      </div>

      {link ? (
        <div className="card mb-3 flex flex-wrap items-center gap-3 p-4">
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

      {open ? (
        <form action={submit} className="card mb-3 grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" placeholder="Jordan Lee" required autoFocus />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" placeholder="jordan@agency.com" required />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" defaultValue="AGENT">
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Sending…" : "Send invitation"}
            </button>
          </div>
          <p className="text-xs text-faint sm:col-span-3">
            They get a link to choose their own password. It works once and runs out after two weeks.
          </p>
        </form>
      ) : null}

      {invites.length > 0 ? (
        <div className="card divide-y divide-line overflow-hidden">
          {invites.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <Clock size={14} className="shrink-0 text-faint" />
              <p className="min-w-0 flex-1 truncate text-sm text-ink-2">
                {i.name} <span className="text-faint">· {i.email}</span>
              </p>
              <span className="chip bg-fill text-xs text-muted">
                {i.role === "ADMIN" ? "Admin" : "Agent"}
              </span>
              <span className={i.expired ? "text-xs text-danger" : "text-xs text-faint"}>
                {i.expired ? "Expired" : `Expires ${i.expiresAt}`}
              </span>
              <button
                onClick={() => revoke(i.id)}
                disabled={pending}
                className="shrink-0 rounded p-1 text-faint hover:bg-danger-soft hover:text-danger"
                aria-label={`Withdraw the invitation to ${i.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
