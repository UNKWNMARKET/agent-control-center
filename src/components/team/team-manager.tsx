"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, KeyRound, Trash2, ShieldCheck } from "lucide-react";
import type { Role } from "@prisma/client";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  createUser,
  setUserRole,
  toggleUserActive,
  deleteUser,
  quickResetPassword,
  setUserGoal,
  type ActionState,
} from "@/app/actions/users";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  leadCount: number;
  monthlyGoal: number | null;
};

export function TeamManager({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowAdd((v) => !v)} className="btn btn-primary">
          <UserPlus size={16} /> Add staff
        </button>
      </div>

      {showAdd ? (
        <AddUserForm onDone={() => setShowAdd(false)} />
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-4 py-3">Member</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Leads</th>
                <th className="px-3 py-3">Goal/mo</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isSelf={m.id === currentUserId}
                  onChange={() => router.refresh()}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createUser,
    undefined,
  );

  // Close + refresh on success.
  if (state?.ok) {
    setTimeout(onDone, 600);
  }

  return (
    <form
      action={action}
      className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2"
    >
      <div>
        <label className="label">Full name</label>
        <input name="name" required className="input" placeholder="Jane Agent" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" required className="input" placeholder="jane@agency.com" />
      </div>
      <div>
        <label className="label">Temporary password</label>
        <input name="password" required minLength={8} className="input" placeholder="At least 8 characters" />
      </div>
      <div>
        <label className="label">Role</label>
        <select name="role" defaultValue="AGENT" className="input">
          <option value="AGENT">Agent (staff)</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {state?.error ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-xl bg-positive-soft px-3.5 py-2.5 text-sm font-medium text-positive sm:col-span-2">
          {state.message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onDone} className="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Adding…" : "Add staff member"}
        </button>
      </div>
    </form>
  );
}

function MemberRow({
  member,
  isSelf,
  onChange,
}: {
  member: Member;
  isSelf: boolean;
  onChange: () => void;
}) {
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
        onChange();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={member.name} className="h-8 w-8" />
          <div>
            <p className="font-medium text-ink">
              {member.name}
              {isSelf ? <span className="ml-1.5 text-xs text-faint">(you)</span> : null}
            </p>
            <p className="text-xs text-muted">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <select
          value={member.role}
          disabled={isSelf || pending}
          onChange={(e) => run(() => setUserRole(member.id, e.target.value as Role))}
          className="input w-auto py-1.5 text-sm"
        >
          <option value="AGENT">Agent</option>
          <option value="ADMIN">Admin</option>
        </select>
      </td>
      <td className="px-3 py-3 text-ink-2">{member.leadCount}</td>
      <td className="px-3 py-3">
        <input
          type="number"
          min="0"
          defaultValue={member.monthlyGoal ?? ""}
          disabled={pending}
          onBlur={(e) => {
            const v = e.target.value.trim();
            run(() => setUserGoal(member.id, v ? Number(v) : null));
          }}
          className="input w-16 py-1 text-sm"
          placeholder="—"
        />
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "chip",
            member.active ? "bg-positive-soft text-positive" : "bg-black/5 text-muted",
          )}
        >
          {member.active ? <ShieldCheck size={13} /> : null}
          {member.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            title="Reset password"
            disabled={pending}
            onClick={() => {
              const pw = prompt(`Set a new password for ${member.name} (min 8 chars):`);
              if (pw) run(() => quickResetPassword(member.id, pw));
            }}
            className="rounded-full p-2 text-muted hover:bg-black/5"
          >
            <KeyRound size={16} />
          </button>
          {!isSelf ? (
            <>
              <button
                disabled={pending}
                onClick={() => run(() => toggleUserActive(member.id))}
                className="rounded-full px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-black/5"
              >
                {member.active ? "Deactivate" : "Activate"}
              </button>
              <button
                title="Delete user"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete ${member.name}? Their leads become unassigned.`))
                    run(() => deleteUser(member.id));
                }}
                className="rounded-full p-2 text-danger hover:bg-danger-soft"
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
