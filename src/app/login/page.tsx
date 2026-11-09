import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign in · Agent Control Center" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string }>;
}) {
  const { next, reset } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-ink">
            Agent Control Center
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Sign in to your agency workspace.
          </p>
        </div>

        {reset ? (
          <div className="mb-4 rounded-xl bg-positive-soft px-3.5 py-2.5 text-center text-sm font-medium text-positive">
            Password updated. Sign in with your new password.
          </div>
        ) : null}

        <div className="card p-7">
          <LoginForm next={next} />
          <div className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-accent hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Protected workspace · Authorized staff only
        </p>
      </div>
    </div>
  );
}
