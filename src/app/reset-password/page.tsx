import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import ResetForm from "./reset-form";

export const metadata: Metadata = { title: "Reset password · Agent Control Center" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-ink">
            Choose a new password
          </h1>
        </div>

        <div className="card p-7">
          {token ? (
            <ResetForm token={token} />
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted">
                This reset link is missing or invalid.
              </p>
              <Link href="/forgot-password" className="btn btn-primary mt-4">
                Request a new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
