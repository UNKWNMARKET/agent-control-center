import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader, Avatar } from "@/components/ui";
import { PasswordForm } from "@/components/account/password-form";

export const metadata: Metadata = { title: "Account · Agent Control Center" };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Account" subtitle="Your profile and password." />

      <div className="card mb-4 flex items-center gap-4 p-5">
        <Avatar name={user.name} className="h-14 w-14 text-lg" />
        <div>
          <p className="text-lg font-semibold text-ink">{user.name}</p>
          <p className="text-sm text-muted">{user.email}</p>
          <span className="chip mt-1.5 bg-accent-soft text-accent">
            {user.role === "ADMIN" ? "Administrator" : "Agent"}
          </span>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-5 text-[15px] font-semibold text-ink">Change password</h2>
        <PasswordForm />
      </div>
    </div>
  );
}
