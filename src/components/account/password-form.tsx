"use client";

import { useActionState } from "react";
import { changeOwnPassword, type ActionState } from "@/app/actions/users";

export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    changeOwnPassword,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Current password</label>
        <input name="current" type="password" required className="input" autoComplete="current-password" />
      </div>
      <div>
        <label className="label">New password</label>
        <input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" />
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

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
