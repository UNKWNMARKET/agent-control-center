import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import ForgotForm from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password · Agent Control Center" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-5 text-[26px] font-semibold tracking-tight text-ink">
            Forgot your password?
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            Enter your email and we’ll send you a reset link.
          </p>
        </div>

        <div className="card p-7">
          <ForgotForm />
        </div>
      </div>
    </div>
  );
}
