import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSync, ShieldCheck, Home, AlertCircle } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader, EmptyState, StatusBadge, Avatar } from "@/components/ui";
import { fullName, formatDate, cn } from "@/lib/utils";
import { getPhoneApp, getMailClient } from "@/lib/settings";
import { CallLink, TextLink } from "@/components/phone-links";
import { MailLink } from "@/components/mail-link";
import { readProperty } from "@/lib/property";
import { OwnershipChip } from "@/components/leads/property-panel";

export const metadata: Metadata = { title: "Renewals · Agent Control Center" };

/** The source label every imported renewal list carries. */
export const RENEWAL_SOURCE = "Auto renewal cross-sell";

const DAY = 86_400_000;

/**
 * Renewal lists: the books of auto-renewal clients uploaded for each agent to
 * work, cross-referenced against the property roll for home and bundle
 * opportunities. Leads carrying an X-date are surfaced first, when there are any.
 */
export default async function RenewalsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const scope: Prisma.LeadWhereInput = isAdmin ? {} : { assignedToId: user.id };

  const [leads, phoneApp, mailClient] = await Promise.all([
    db.lead.findMany({
      where: {
        ...scope,
        OR: [{ source: RENEWAL_SOURCE }, { tags: { has: "cross-sell" } }],
        status: { notIn: ["SOLD", "LOST", "DNC"] },
      },
      orderBy: [{ assignedToId: "asc" }, { lastName: "asc" }],
      include: { assignedTo: true },
    }),
    getPhoneApp(),
    getMailClient(),
  ]);

  const expiring = leads
    .filter((l) => l.policyExpiresAt && l.policyExpiresAt.getTime() <= Date.now() + 60 * DAY)
    .sort((a, b) => a.policyExpiresAt!.getTime() - b.policyExpiresAt!.getTime());

  // Admins see a section per agent; an agent sees their own list split by
  // whether ownership was actually confirmed.
  const groups = new Map<string, typeof leads>();
  for (const l of leads) {
    const key = isAdmin
      ? l.assignedTo?.name ?? "Unassigned"
      : l.tags.includes("verify-owner")
        ? "Needs ownership check"
        : "Confirmed homeowners";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  }

  const row = (l: (typeof leads)[number]) => {
    const own = readProperty(l.property);
    const verify = l.tags.includes("verify-owner");
    return (
      <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2">
        <Link href={`/leads/${l.id}?from=%2Frenewals`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={fullName(l)} className="h-8 w-8" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{fullName(l)}</p>
            <p className="flex flex-wrap items-center gap-x-2 truncate text-xs text-muted">
              {l.address1 ? (
                <span className="inline-flex items-center gap-1">
                  <Home size={11} />
                  {l.address1}
                  {l.city ? `, ${l.city}` : ""}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-warning">
                  <AlertCircle size={11} />
                  Address not confirmed
                </span>
              )}
              {l.currentCarrier ? (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck size={11} />
                  {l.currentCarrier}
                </span>
              ) : null}
            </p>
          </div>
        </Link>

        <span className="w-32 shrink-0">
          <span className="block text-[0.65rem] uppercase tracking-wide text-faint">Policy #</span>
          <span className="block font-mono text-xs text-ink-2">{l.externalId ?? l.policyNumber ?? "—"}</span>
        </span>

        {own ? <OwnershipChip ownership={own.ownership} homestead={own.homestead} /> : null}
        <StatusBadge status={l.status} />

        <span className="flex items-center gap-2 text-xs text-muted">
          {l.phone ? (
            <>
              <CallLink phone={l.phone} app={phoneApp} leadId={l.id} />
              <TextLink phone={l.phone} app={phoneApp} leadId={l.id} />
            </>
          ) : (
            <span className="text-faint">no phone on file</span>
          )}
          {l.email ? <MailLink email={l.email} client={mailClient}>Email</MailLink> : null}
        </span>

        {l.policyExpiresAt ? (
          <span className="w-24 shrink-0 text-right text-xs font-medium text-ink-2">
            {formatDate(l.policyExpiresAt)}
          </span>
        ) : verify ? (
          <span className="w-24 shrink-0 text-right text-[0.7rem] text-faint">verify owner</span>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Renewals"
        subtitle={
          leads.length
            ? `${leads.length} renewal client${leads.length === 1 ? "" : "s"} ${isAdmin ? "across the team" : "on your list"}`
            : "No renewal lists loaded yet"
        }
      />

      {leads.length === 0 ? (
        <EmptyState
          icon={<CalendarSync size={26} />}
          title="No renewal clients yet"
          description="Renewal lists imported for an agent show up here, with the property cross-reference already attached so you can see who owns their home."
        />
      ) : (
        <div className="space-y-5">
          {expiring.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-danger">
                Expiring within 60 days <span className="text-faint">· {expiring.length}</span>
              </h2>
              <div className="card divide-y divide-line overflow-hidden">{expiring.map(row)}</div>
            </div>
          ) : null}

          {[...groups.entries()].map(([name, items]) => (
            <div key={name}>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                <h2 className={cn("text-sm font-semibold", name === "Needs ownership check" ? "text-warning" : "text-ink")}>
                  {name} <span className="text-faint">· {items.length}</span>
                </h2>
                {isAdmin ? (
                  <span className="text-xs text-faint">
                    {items.filter((l) => l.tags.includes("verify-owner")).length} need an ownership check
                  </span>
                ) : null}
              </div>
              <div className="card divide-y divide-line overflow-hidden">{items.map(row)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
