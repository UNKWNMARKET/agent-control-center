import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "@/components/import-client";

export const metadata: Metadata = { title: "Import · Agent Control Center" };

export default async function ImportPage() {
  await requireUser();
  const vendors = await db.vendor.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Import leads"
        subtitle="Upload a CSV file to add leads in bulk."
      />
      <ImportClient vendors={vendors} />
    </div>
  );
}
