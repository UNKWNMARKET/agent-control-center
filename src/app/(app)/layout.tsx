import { requireUser, db } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { DailyWelcome } from "@/components/daily-welcome";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Shown beside Follow-ups in the nav, so what's waiting is visible from
  // every page. Counted the way the Follow-ups page counts "due".
  const followUpsDue = await db.lead.count({
    where: {
      ...(user.role === "ADMIN" ? {} : { assignedToId: user.id }),
      followUpAt: { not: null, lte: new Date() },
    },
  });

  return (
    <div className="min-h-dvh">
      <DailyWelcome userId={user.id} name={user.name} />
      <AppNav
        user={{ name: user.name, email: user.email }}
        isAdmin={user.role === "ADMIN"}
        agencyName={user.agency.name}
        isOwner={user.isPlatformOwner}
        followUpsDue={followUpsDue}
      />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-9">
          {children}
        </div>
      </main>
    </div>
  );
}
