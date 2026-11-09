"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requestPasswordReset, type ResetState } from "@/app/actions/password-reset";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(
    requestPasswordReset,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 size={36} className="text-positive" />
        <p className="mt-3 text-sm text-ink-2">{state.message}</p>
        <Link href="/login" className="btn btn-secondary mt-5">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@agency.com"
          className="input"
        />
      </div>

      {state?.error ? (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn btn-primary mt-1 h-11">
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link
        href="/login"
        className="text-center text-sm text-muted hover:text-ink"
      >
        Back to sign in
      </Link>
    </form>
  );
}
