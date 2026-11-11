import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Copy } from "lucide-react";
import type { LeadStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { unscopedDb } from "@/lib/db";
import { LEAD_STATUSES } from "@/lib/leads";
import { getMailClient, getPhoneApp } from "@/lib/settings";
import { readProperty } from "@/lib/property";
import { leadIdsByPhone } from "@/lib/phone-search";
import { PageHeader } from "@/components/ui";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { ExportButton } from "@/components/leads/export-button";

export const metadata: Metadata = { title: "Leads · Agent Control Center" };

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    vendor?: string;
    assignee?: string;
    dnc?: string;
    followup?: string;
    tag?: string;
    xdate?: string;
    page?: string;
  }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;

  const where: Prisma.LeadWhereInput = {};
  if (!isAdmin) where.assignedToId = user.id;

  // Lost leads are their own list — they'd otherwise bury the live ones.
  const showingLost = sp.status === "LOST";
  if (sp.status && LEAD_STATUSES.includes(sp.status as LeadStatus)) {
    where.status = sp.status as LeadStatus;
  } else {
    where.status = { not: "LOST" };
  }
  if (sp.vendor) where.vendorId = sp.vendor;
  if (sp.dnc === "OK" || sp.dnc === "BLOCKED" || sp.dnc === "UNKNOWN") {
    where.dncStatus = sp.dnc;
  }
  if (sp.followup === "due") where.followUpAt = { not: null, lte: new Date() };
  else if (sp.followup === "scheduled") where.followUpAt = { not: null };
  if (sp.xdate === "past") {
    where.policyExpiresAt = { not: null, lt: new Date() };
  } else if (sp.xdate && /^\d+$/.test(sp.xdate)) {
    const until = new Date();
    until.setDate(until.getDate() + Number(sp.xdate));
    where.policyExpiresAt = { gte: new Date(), lte: until };
  }
  if (sp.tag) where.tags = { has: sp.tag };
  if (isAdmin && sp.assignee) {
    where.assignedToId = sp.assignee === "unassigned" ? null : sp.assignee;
  }
  if (sp.q) {
    const q = sp.q.trim();
    // Phone matching ignores punctuation on both sides — see lib/phone-search.
    const phoneIds = await leadIdsByPhone(q);
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { policyNumber: { contains: q, mode: "insensitive" } },
      ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
    ];
  }

  const page = Math.max(1, Number(sp.page) || 1);

  const [leads, total, vendors, users, tagRows, mailClient, phoneApp, lostCount] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { vendor: true, assignedTo: true },
    }),
    db.lead.count({ where }),
    db.vendor.findMany({ orderBy: { name: "asc" } }),
    isAdmin
      ? db.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    // Raw SQL bypasses the scoped client, so the agency filter is written out.
    unscopedDb.$queryRaw<{ tag: string }[]>`SELECT DISTINCT unnest(tags) AS tag FROM "Lead" WHERE "agencyId" = ${user.agencyId} ORDER BY tag`,
    getMailClient(),
    getPhoneApp(),
    db.lead.count({ where: { ...(isAdmin ? {} : { assignedToId: user.id }), status: "LOST" } }),
  ]);
  const allTags = tagRows.map((r) => r.tag);

  const rows = leads.map((l) => ({
    id: l.id,
    firstName: l.firstName,
    lastName: l.lastName,
    phone: l.phone,
    email: l.email,
    product: l.product,
    status: l.status,
    source: l.vendor?.name ?? l.source ?? null,
    state: l.state,
    assignedToName: l.assignedTo?.name ?? null,
    dncStatus: l.dncStatus,
    dncReason: l.dncReason,
    tags: l.tags,
    policyExpiresAt: l.policyExpiresAt ? l.policyExpiresAt.toISOString() : null,
    ownership: readProperty(l.property)?.ownership ?? null,
    homestead: readProperty(l.property)?.homestead ?? false,
    followUpAt: l.followUpAt ? l.followUpAt.toISOString() : null,
    contactedAt: l.contactedAt ? l.contactedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title={showingLost ? "Lost leads" : "Leads"}
        subtitle={
          showingLost
            ? `${total.toLocaleString()} closed out — kept out of the main list`
            : sp.status
              ? `${total.toLocaleString()} ${total === 1 ? "lead" : "leads"}`
              : `${total.toLocaleString()} active · ${lostCount.toLocaleString()} lost`
        }
      >
        <ExportButton />
        {isAdmin ? (
          <Link href="/duplicates" className="btn btn-secondary">
            <Copy size={15} /> Duplicates
          </Link>
        ) : null}
        <Link href="/leads/new" className="btn btn-primary">
          <Plus size={15} /> Add lead
        </Link>
      </PageHeader>

      <LeadsFilters vendors={vendors} users={users} tags={allTags} isAdmin={isAdmin} />

      <LeadsTable
        rows={rows}
        users={users}
        isAdmin={isAdmin}
        page={page}
        totalPages={totalPages}
        total={total}
        mailClient={mailClient}
        phoneApp={phoneApp}
      />
    </div>
  );
}
