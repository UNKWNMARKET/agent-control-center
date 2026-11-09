import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { readInvite } from "@/app/actions/accept-invite";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Set your password · Agent Control Center" };
export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await readInvite(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3">
          <Logo className="h-12 w-12" />
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {invite?.state === "ok" ? invite.agencyName : "Agent Control Center"}
          </h1>
        </div>

        <div className="card p-6">
          {invite?.state === "ok" ? (
            <>
              <p className="mb-5 text-sm text-muted">
                Welcome, {invite.name}. Choose a password and you&apos;re in. You&apos;ll sign in
                with <span className="font-medium text-ink">{invite.email}</span>.
              </p>
              <AcceptForm token={token} />
            </>
          ) : (
            <div className="text-center">
              <p className="text-sm text-muted">
                {invite?.state === "used"
                  ? "This invitation has already been used. Try signing in instead."
                  : invite?.state === "expired"
                    ? "This invitation has run out. Ask whoever invited you for another."
                    : invite?.state === "inactive"
                      ? "That workspace isn't active at the moment. Speak to whoever invited you."
                      : "This invitation link isn't valid."}
              </p>
              <Link href="/login" className="btn btn-secondary mt-5">
                Go to sign in
              </Link>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          Protected workspace · Authorized staff only
        </p>
      </div>
    </div>
  );
}
