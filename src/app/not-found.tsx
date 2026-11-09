import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo className="h-12 w-12" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-muted">
        That page doesn’t exist or you don’t have access to it.
      </p>
      <Link href="/dashboard" className="btn btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}
