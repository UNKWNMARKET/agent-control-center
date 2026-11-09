import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TeamManager } from "@/components/team/team-manager";
import { InviteStaff } from "@/components/team/invite-staff";

export const metadata: Metadata = { title: "Team · Agent Control Center" };

export default async function TeamPage() {
  const admin = await requireAdmin();

  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { assignedLeads: true } } },
  });

  const members = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    leadCount: u._count.assignedLeads,
    monthlyGoal: u.monthlyGoal,
  }));

  const invites = await db.invite.findMany({
    where: { acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Manage who can sign in, their role, and lead assignments."
      />
      <InviteStaff
        invites={invites.map((i) => ({
          id: i.id,
          name: i.name,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString().slice(0, 10),
          expired: i.expiresAt < new Date(),
        }))}
      />
      <TeamManager members={members} currentUserId={admin.id} />
    </div>
  );
}
