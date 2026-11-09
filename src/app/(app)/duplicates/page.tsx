import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/auth";
import { normalizePhone } from "@/lib/dnc";
import { PageHeader, EmptyState } from "@/components/ui";
import { DedupClient } from "@/components/dedup/dedup-client";
import { fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Duplicates · Agent Control Center" };

export default async function DuplicatesPage() {
  await requireAdmin();

  const leads = await db.lead.findMany({
    orderBy: { createdAt: "desc" },
    include: { vendor: true, assignedTo: true, _count: { select: { activities: true } } },
  });

  // Group leads that share a normalized phone number.
  const map = new Map<string, typeof leads>();
  for (const l of leads) {
    const n = normalizePhone(l.phone);
    if (!n) continue;
    const arr = map.get(n) ?? [];
    arr.push(l);
    map.set(n, arr);
  }

  const groups = [...map.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([phone, arr]) => ({
      phone,
      leads: arr.map((l) => ({
        id: l.id,
        name: fullName(l),
        email: l.email,
        source: l.vendor?.name ?? l.source ?? null,
        status: l.status,
        assignedToName: l.assignedTo?.name ?? null,
        activityCount: l._count.activities,
        createdAt: l.createdAt.toISOString(),
      })),
    }));

  return (
    <div>
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> All leads
      </Link>
      <PageHeader
        title="Duplicate leads"
        subtitle={`${groups.length} duplicate ${
          groups.length === 1 ? "group" : "groups"
        } sharing a phone number`}
      />
      {groups.length === 0 ? (
        <EmptyState
          title="No duplicates found"
          description="Leads that share the same phone number will appear here so you can merge them into one record."
        />
      ) : (
        <DedupClient groups={groups} />
      )}
    </div>
  );
}
