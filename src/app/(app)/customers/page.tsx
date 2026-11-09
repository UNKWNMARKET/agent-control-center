import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Users2, ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader, EmptyState, Avatar } from "@/components/ui";
import { fullName, formatPhone } from "@/lib/utils";
import { getPhoneApp, getMailClient } from "@/lib/settings";
import { CallLink, TextLink } from "@/components/phone-links";
import { MailLink } from "@/components/mail-link";
import { CustomerSearch } from "@/components/customers/customer-search";
import { CUSTOMER_WHERE } from "@/lib/visibility";
import { leadIdsByPhone } from "@/lib/phone-search";

export const metadata: Metadata = { title: "Customers · Agent Control Center" };

/**
 * The agency's book — everyone who has actually been sold something.
 *
 * Not scoped to the assigned agent, on purpose: when a customer rings in,
 * whoever answers needs to find them by phone, email, name or policy number.
 *
 * Prospects are not here. Until a sale is recorded the record belongs to the
 * agent working it and only they can see it — see src/lib/visibility.ts.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const q = (await searchParams).q?.trim() ?? "";

  const where: Prisma.LeadWhereInput = { ...CUSTOMER_WHERE };
  if (q) {
    // Phone matching ignores punctuation on both sides — see lib/phone-search.
    const phoneIds = await leadIdsByPhone(q);
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { address1: { contains: q, mode: "insensitive" } },
      { policyNumber: { contains: q, mode: "insensitive" } },
      { externalId: { contains: q, mode: "insensitive" } },
      ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
      // "first last" typed in one go
      ...(q.includes(" ")
        ? [{
            AND: [
              { firstName: { contains: q.split(/\s+/)[0], mode: "insensitive" as const } },
              { lastName: { contains: q.split(/\s+/).slice(1).join(" "), mode: "insensitive" as const } },
            ],
          }]
        : []),
    ];
  }

  const [customers, total, phoneApp, mailClient] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        assignedTo: true,
        _count: { select: { policies: true } },
        policies: { where: { status: "ACTIVE" }, select: { product: true, expiresAt: true } },
      },
      take: 200,
    }),
    db.lead.count({ where: CUSTOMER_WHERE }),
    getPhoneApp(),
    getMailClient(),
  ]);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={q ? `${customers.length} matching "${q}"` : `${total} customer${total === 1 ? "" : "s"} · sold, and visible to every agent`}
      >
        <Link href="/customers/new" className="btn btn-primary">
          <UserPlus size={16} /> Add customer
        </Link>
      </PageHeader>

      <CustomerSearch initial={q} />

      {customers.length === 0 ? (
        <EmptyState
          icon={<Users2 size={26} />}
          title={q ? "Nobody matches that" : "No customers yet"}
          description={
            q
              ? "Try a phone number, an email, a last name, or a policy number. Only customers with a recorded sale appear here."
              : "A household appears here once their sale is recorded. Until then the record stays with the agent working it."
          }
        />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {customers.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Link href={`/leads/${c.id}?from=%2Fcustomers`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={fullName(c)} className="h-8 w-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{fullName(c)}</p>
                  <p className="truncate text-xs text-muted">
                    {[c.address1, c.city].filter(Boolean).join(", ") || "No address on file"}
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-2 text-xs text-muted">
                {c.phone ? (
                  <>
                    <CallLink phone={c.phone} app={phoneApp} leadId={c.id} />
                    <TextLink phone={c.phone} app={phoneApp} leadId={c.id} />
                  </>
                ) : (
                  <span className="text-faint">no phone</span>
                )}
                {c.email ? <MailLink email={c.email} client={mailClient} className="truncate">Email</MailLink> : null}
              </div>

              <div className="w-40 shrink-0">
                {c._count.policies > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-positive">
                    <ShieldCheck size={12} />
                    {c._count.policies} {c._count.policies === 1 ? "policy" : "policies"}
                    {c.policies[0]?.product ? ` · ${c.policies[0].product}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-faint">No policy on file</span>
                )}
              </div>

              <div className="w-28 shrink-0 truncate text-xs text-muted">{c.assignedTo?.name ?? "Unassigned"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
