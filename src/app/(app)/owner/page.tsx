import type { Metadata } from "next";
import { Building2, Users2, ShieldCheck } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import { unscopedDb } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { OwnerConsole } from "@/components/owner/owner-console";

export const metadata: Metadata = { title: "Agencies · Agent Control Center" };
export const dynamic = "force-dynamic";

/**
 * The platform owner's view: every agency on the system.
 *
 * This is the one page that deliberately reads across agencies, which is why
 * it uses the unscoped client openly rather than through the usual handle.
 * Everything here is about who is on the platform and whether they have paid
 * — never the contents of anyone's book.
 */
export default async function OwnerPage() {
  await requireOwner();

  const agencies = await unscopedDb.agency.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true, leads: true, policies: true } },
      invites: {
        where: { acceptedAt: null },
        select: { id: true, email: true, name: true, expiresAt: true },
      },
    },
  });

  const active = agencies.filter((a) => a.status === "ACTIVE");
  const monthly = active.reduce((sum, a) => sum + (a.monthlyFee ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Agencies"
        subtitle={`${active.length} active · $${monthly.toLocaleString("en-US")} a month`}
      />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={<Building2 size={16} />} label="Agencies" value={String(agencies.length)} />
        <Stat
          icon={<Users2 size={16} />}
          label="People"
          value={String(agencies.reduce((s, a) => s + a._count.users, 0))}
        />
        <Stat
          icon={<ShieldCheck size={16} />}
          label="Policies written"
          value={String(agencies.reduce((s, a) => s + a._count.policies, 0))}
        />
      </div>

      <OwnerConsole
        agencies={agencies.map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          status: a.status,
          monthlyFee: a.monthlyFee,
          paidThrough: a.paidThrough ? a.paidThrough.toISOString().slice(0, 10) : null,
          billingNotes: a.billingNotes,
          users: a._count.users,
          leads: a._count.leads,
          policies: a._count.policies,
          pendingInvites: a.invites.map((i) => ({
            id: i.id,
            email: i.email,
            name: i.name,
            expiresAt: i.expiresAt.toISOString().slice(0, 10),
          })),
        }))}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold tracking-tight text-ink">{value}</p>
    </div>
  );
}
