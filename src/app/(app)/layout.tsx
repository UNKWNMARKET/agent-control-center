import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { DailyWelcome } from "@/components/daily-welcome";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh">
      <DailyWelcome userId={user.id} name={user.name} />
      <AppNav
        user={{ name: user.name, email: user.email }}
        isAdmin={user.role === "ADMIN"}
      />
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>
    </div>
  );
}
