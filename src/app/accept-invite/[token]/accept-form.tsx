"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { acceptInvite } from "@/app/actions/accept-invite";

export function AcceptForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          // A success redirects, so anything that comes back is a problem.
          const res = await acceptInvite(token, fd);
          if (res && !res.ok) setError(res.message ?? "That didn't work.");
        })
      }
      className="space-y-4"
    >
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="input"
          autoFocus
        />
        <p className="mt-1.5 text-xs text-faint">At least 10 characters.</p>
      </div>

      <div>
        <label className="label" htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className="input"
        />
      </div>

      {error ? (
        <p className="flex gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary w-full justify-center">
        {pending ? "Setting up…" : "Set password and sign in"}
      </button>
    </form>
  );
}
