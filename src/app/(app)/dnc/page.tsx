import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { DncManager } from "@/components/dnc/dnc-manager";

export const metadata: Metadata = { title: "Do-Not-Call · Agent Control Center" };

export default async function DncPage() {
  await requireAdmin();

  const [entries, blocked] = await Promise.all([
    db.dncEntry.findMany({ orderBy: { createdAt: "desc" } }),
    db.lead.count({ where: { dncStatus: "BLOCKED" } }),
  ]);

  const data = entries.map((e) => ({
    id: e.id,
    phone: e.phone,
    reason: e.reason,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Do Not Call"
        subtitle={`${entries.length} suppressed ${
          entries.length === 1 ? "number" : "numbers"
        } · ${blocked} flagged ${blocked === 1 ? "lead" : "leads"}`}
      />
      <DncManager entries={data} />
    </div>
  );
}
