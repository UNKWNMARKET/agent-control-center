import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { VendorManager } from "@/components/vendors/vendor-manager";

export const metadata: Metadata = { title: "Integrations · Agent Control Center" };

export default async function VendorsPage() {
  await requireAdmin();

  const vendors = await db.vendor.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { leads: true } } },
  });

  const data = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    slug: v.slug,
    webhookToken: v.webhookToken,
    active: v.active,
    costPerLead: v.costPerLead,
    leadCount: v._count.leads,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Lead sources"
        subtitle="Connect lead carriers. Each source gets a private webhook URL to deliver leads in real time."
      />
      <VendorManager vendors={data} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""} />
    </div>
  );
}
