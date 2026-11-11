import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, CalendarClock, Ban, FileText } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui";
import { fullName, cn } from "@/lib/utils";
import { PolicyActions } from "@/components/agency/policy-actions";

export const metadata: Metadata = { title: "Agency management · Agent Control Center" };

/** A policy lands on the renewal list this many days before it expires. */
export const RENEWAL_WINDOW_DAYS = 45;

type Tab = "active" | "renewal" | "cancelled";

const DAY = 86_400_000;
const money = (n: number | null) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function AgencyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const tab: Tab = sp.tab === "cancelled" ? "cancelled" : sp.tab === "renewal" ? "renewal" : "active";

  // Agents see the policies they wrote; the owner sees the whole book.
  const mine: Prisma.PolicyWhereInput = isAdmin ? {} : { soldById: user.id };
  const renewalCutoff = new Date(Date.now() + RENEWAL_WINDOW_DAYS * DAY);

  const where: Record<Tab, Prisma.PolicyWhereInput> = {
    active: { ...mine, status: "ACTIVE" },
    renewal: { ...mine, status: "ACTIVE", expiresAt: { lte: renewalCutoff } },
    cancelled: { ...mine, status: "CANCELLED" },
  };

  const [policies, counts] = await Promise.all([
    db.policy.findMany({
      where: where[tab],
      orderBy: tab === "cancelled" ? { cancelledAt: "desc" } : { expiresAt: "asc" },
      include: { lead: true, soldBy: true, _count: { select: { documents: true } } },
      take: 300,
    }),
    Promise.all([
      db.policy.count({ where: where.active }),
      db.policy.count({ where: where.renewal }),
      db.policy.count({ where: where.cancelled }),
    ]),
  ]);

  const [activeCount, renewalCount, cancelledCount] = counts;
  const inForcePremium = tab === "active" ? policies.reduce((s, p) => s + (p.premium ?? 0), 0) : 0;

  const tabs: { key: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: "active", label: "Active", count: activeCount, icon: <ShieldCheck size={15} /> },
    { key: "renewal", label: "Renewal", count: renewalCount, icon: <CalendarClock size={15} /> },
    { key: "cancelled", label: "Cancelled", count: cancelledCount, icon: <Ban size={15} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Book of business"
        subtitle={
          tab === "active"
            ? `${activeCount} in force${inForcePremium ? ` · ${money(inForcePremium)} written premium` : ""}`
            : tab === "renewal"
              ? `Expiring within ${RENEWAL_WINDOW_DAYS} days`
              : `${cancelledCount} off the books`
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/agency?tab=${t.key}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-ink-2 hover:border-accent hover:text-accent",
            )}
          >
            {t.icon}
            {t.label}
            <span className={cn("text-xs", tab === t.key ? "text-accent" : "text-faint")}>{t.count}</span>
          </Link>
        ))}
      </div>

      {policies.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={26} />}
          title={
            tab === "active" ? "No policies in force yet"
            : tab === "renewal" ? "Nothing coming up for renewal"
            : "No cancelled policies"
          }
          description={
            tab === "active"
              ? "Marking a lead sold creates its policy here, with the term you choose setting the renewal date."
              : tab === "renewal"
                ? `Policies appear here ${RENEWAL_WINDOW_DAYS} days before they expire, so there's time to requote.`
                : "Policies taken out of force show here with the reason and date."
          }
        />
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {policies.map((p) => {
            const days = Math.round((p.expiresAt.getTime() - Date.now()) / DAY);
            const urgent = days <= 14;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/leads/${p.leadId}?from=%2Fagency%3Ftab%3D${tab}`}
                    className="truncate text-sm font-medium text-ink hover:text-accent hover:underline"
                  >
                    {fullName(p.lead)}
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {p.product ? <span>{p.product}</span> : null}
                    {p.carrier ? <span>{p.carrier}</span> : null}
                    {p.policyNumber ? <span className="font-mono">{p.policyNumber}</span> : null}
                    {p._count.documents > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <FileText size={11} />
                        {p._count.documents}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="w-24 shrink-0">
                  <span className="block text-[0.65rem] uppercase tracking-wide text-faint">Premium</span>
                  <span className="block text-sm font-medium text-ink-2">{money(p.premium)}</span>
                </div>

                <div className="w-28 shrink-0">
                  <span className="block text-[0.65rem] uppercase tracking-wide text-faint">Term</span>
                  <span className="block text-sm text-ink-2">{p.termMonths} months</span>
                </div>

                <div className="w-36 shrink-0">
                  <span className="block text-[0.65rem] uppercase tracking-wide text-faint">
                    {p.status === "CANCELLED" ? "Cancelled" : "Expires"}
                  </span>
                  <span
                    className={cn(
                      "block text-sm",
                      p.status === "CANCELLED" ? "text-faint" : urgent ? "font-medium text-danger" : "text-ink-2",
                    )}
                  >
                    {p.status === "CANCELLED"
                      ? p.cancelledAt ? day(p.cancelledAt) : "—"
                      : `${day(p.expiresAt)}${days >= 0 ? ` · ${days}d` : " · lapsed"}`}
                  </span>
                </div>

                {isAdmin ? (
                  <div className="w-28 shrink-0 truncate text-xs text-muted">{p.soldBy?.name ?? "—"}</div>
                ) : null}

                <PolicyActions
                  policyId={p.id}
                  status={p.status}
                  cancelReason={p.cancelReason}
                  showRenew={tab === "renewal"}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
