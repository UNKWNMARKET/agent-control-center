import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  MapPin,
  Calendar,
  FileText,
  UserCog,
  Activity as ActivityIcon,
  ArrowRightLeft,
  PhoneCall,
  MessageSquare,
  PhoneOff,
  Mail,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/auth";
import { PRODUCTS } from "@/lib/leads";
import { getMailClient } from "@/lib/settings";
import { MailLink, MailButton } from "@/components/mail-link";
import { parseVehicles, vehiclesFromPayload, driversFromPayload } from "@/lib/vehicles";
import { VehiclesEditor } from "@/components/leads/vehicles-editor";
import { PropertyMap } from "@/components/leads/property-map";
import { PropertyPanel } from "@/components/leads/property-panel";
import { readProperty } from "@/lib/property";
import { DocumentsPanel } from "@/components/leads/documents-panel";
import { storageConfigured } from "@/lib/storage";
import { DriversEditor } from "@/components/leads/drivers-editor";
import { parseDrivers } from "@/lib/drivers";
import { NextStep } from "@/components/leads/next-step";
import { MarkSold } from "@/components/leads/mark-sold";
import { PermitsPanel } from "@/components/leads/permits-panel";
import { readPermits, permitsConfigured, permitSearchUrl, roofAgeHint } from "@/lib/permits";
import { CallLink, PhoneButtons } from "@/components/phone-links";
import { smsHref } from "@/lib/phone";
import { getPhoneApp } from "@/lib/settings";
import { fullName, formatDateTime, timeAgo, formatPhone } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import { CallCount } from "@/components/call-count";
import {
  StatusControl,
  AssignControl,
  DeleteLeadButton,
} from "@/components/leads/lead-controls";
import { DncControl } from "@/components/leads/dnc-control";
import { FollowUpTags } from "@/components/leads/followup-tags";
import { LogActivity } from "@/components/leads/log-activity";
import { SendText } from "@/components/leads/send-text";
import { ScoreBadge } from "@/components/score-badge";
import { leadScore } from "@/lib/score";
import { smsConfigured, canText } from "@/lib/sms";
import { updateLeadDetails, addNote } from "@/app/actions/leads";
import { canViewLead } from "@/lib/visibility";

const v = (x: string | null | undefined) => x ?? "";

/**
 * Where "back" should go. Rows carry the list they came from in `?from=`, so an
 * agent working a filtered list or the renewals board returns to it — same
 * filters, same page — instead of being dumped on an unfiltered lead list.
 * Only internal paths are honoured.
 */
function backTo(from: string | undefined): { href: string; label: string } {
  const safe = from && from.startsWith("/") && !from.startsWith("//") && !from.includes("://") ? from : null;
  if (!safe) return { href: "/leads", label: "All leads" };
  if (safe.startsWith("/renewals")) return { href: safe, label: "Back to renewals" };
  if (safe.startsWith("/follow-ups")) return { href: safe, label: "Back to follow-ups" };
  if (safe.startsWith("/dashboard")) return { href: safe, label: "Back to dashboard" };
  if (safe.startsWith("/duplicates")) return { href: safe, label: "Back to duplicates" };
  return { href: safe, label: safe.includes("?") ? "Back to your list" : "All leads" };
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; sell?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const back = backTo(query.from);
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      vendor: true,
      assignedTo: true,
      activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!lead) notFound();
  // Their own record, or a sold customer the whole agency shares. A prospect
  // someone else is working stays invisible, even with the URL.
  if (!canViewLead(user, lead)) notFound();

  const users = isAdmin
    ? await db.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const mailClient = await getMailClient();
  const phoneApp = await getPhoneApp();

  const [documents, team] = await Promise.all([
    db.policyDocument.findMany({ where: { leadId: lead.id }, orderBy: { uploadedAt: "desc" } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const teamById = new Map(team.map((t) => [t.id, t.name]));
  const savedProperty = readProperty(lead.property);
  const savedVehicles = parseVehicles(lead.vehicles);
  const vendorVehicles = savedVehicles.length ? [] : vehiclesFromPayload(lead.rawPayload);
  const listedVehicles = savedVehicles.length ? savedVehicles : vendorVehicles;
  const listedDrivers = driversFromPayload(lead.rawPayload);
  const mapAddress = [lead.address1, lead.city, lead.state, lead.zip]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const mailSubject = lead.product
    ? `Your ${lead.product.toLowerCase()} insurance quote`
    : "Your insurance quote";

  const productOptions = lead.product && !PRODUCTS.includes(lead.product)
    ? [lead.product, ...PRODUCTS]
    : PRODUCTS;

  return (
    <div>
      <Link
        href={back.href}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> {back.label}
      </Link>

      {/* Header */}
      <div className="card mb-4 flex flex-wrap items-center gap-4 p-5">
        <Avatar name={fullName(lead)} className="h-13 w-13 text-base" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {fullName(lead)}
            </h1>
            <ScoreBadge {...leadScore(lead)} />
          </div>
          <p className="text-sm text-muted">
            {lead.source ?? lead.vendor?.name ?? "Manual entry"} · Added{" "}
            {formatDateTime(lead.createdAt)}
          </p>
          <CallCount phone={lead.phone} phoneSecondary={lead.phoneSecondary} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MarkSold
            leadId={lead.id}
            isSold={lead.status === "SOLD"}
            storageReady={storageConfigured()}
            kindsOnFile={documents.map((d) => d.kind).filter((k): k is string => Boolean(k))}
            openOnLoad={query.sell === "1"}
            defaults={{
              premium: lead.premium != null ? String(lead.premium) : "",
              carrier: v(lead.carrier),
              policyNumber: v(lead.policyNumber),
              effectiveDate: v(lead.effectiveDate),
              product: v(lead.product),
            }}
          />
          <PhoneButtons phone={lead.phone} app={phoneApp} leadId={lead.id} />
          <MailButton
            email={lead.email}
            client={mailClient}
            subject={mailSubject}
          />
          <StatusControl leadId={lead.id} status={lead.status} />
          {isAdmin ? (
            <AssignControl
              leadId={lead.id}
              assignedToId={lead.assignedToId}
              users={users}
            />
          ) : (
            <span className="chip bg-black/5 text-muted">
              <UserCog size={13} />
              {lead.assignedTo?.name ?? "Unassigned"}
            </span>
          )}
        </div>
      </div>

      {/* Next touch — kept above the fold, since a lead with no next step is a lead going cold */}
      {lead.status !== "SOLD" && lead.status !== "LOST" && lead.status !== "DNC" ? (
        <div className="mb-4">
          <NextStep
            leadId={lead.id}
            followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
          />
        </div>
      ) : null}

      {/* Compliance + workflow */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DncControl
          leadId={lead.id}
          status={lead.dncStatus}
          reason={lead.dncReason}
          checkedAt={lead.dncCheckedAt ? lead.dncCheckedAt.toISOString() : null}
          hasPhone={Boolean(lead.phone)}
        />
        <FollowUpTags
          leadId={lead.id}
          followUpAt={lead.followUpAt ? lead.followUpAt.toISOString() : null}
          tags={lead.tags}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Details form */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="mb-5 text-[15px] font-semibold text-ink">Lead details</h2>
          <form action={updateLeadDetails.bind(null, lead.id)} className="space-y-5">
            <Section title="Contact" icon={<Phone size={15} />}>
              <Field label="First name" name="firstName" defaultValue={v(lead.firstName)} />
              <Field label="Last name" name="lastName" defaultValue={v(lead.lastName)} />
              <Field
                label="Phone"
                name="phone"
                defaultValue={v(lead.phone)}
                action={
                  lead.phone ? (
                    <span className="flex items-center gap-3 text-xs font-medium">
                      <CallLink phone={lead.phone} app={phoneApp} leadId={lead.id} className="text-accent">
                        Call
                      </CallLink>
                      <a
                        href={smsHref(lead.phone, phoneApp) ?? "#"}
                        target={phoneApp === "rc_web" ? "_blank" : undefined}
                        rel={phoneApp === "rc_web" ? "noopener noreferrer" : undefined}
                        className="text-accent"
                      >
                        Text
                      </a>
                    </span>
                  ) : null
                }
              />
              <Field label="Secondary phone" name="phoneSecondary" defaultValue={v(lead.phoneSecondary)} />
              <Field
                label="Email"
                name="email"
                type="email"
                defaultValue={v(lead.email)}
                className="sm:col-span-2"
                action={
                  lead.email ? (
                    <MailLink
                      email={lead.email}
                      client={mailClient}
                      subject={mailSubject}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent"
                    >
                      <Mail size={12} /> Compose email
                    </MailLink>
                  ) : null
                }
              />
            </Section>

            <Section title="Address" icon={<MapPin size={15} />}>
              <Field label="Address" name="address1" defaultValue={v(lead.address1)} className="sm:col-span-2" />
              <Field label="Apt / Unit" name="address2" defaultValue={v(lead.address2)} />
              <Field label="City" name="city" defaultValue={v(lead.city)} />
              <Field label="State" name="state" defaultValue={v(lead.state)} />
              <Field label="ZIP" name="zip" defaultValue={v(lead.zip)} />
              {mapAddress ? (
                <div className="grid grid-cols-1 gap-5 border-t border-line pt-4 sm:col-span-2 sm:grid-cols-[auto_1fr]">
                  <PropertyMap address={mapAddress} />
                  <div>
                    <PropertyPanel leadId={lead.id} initial={savedProperty} />
                    <div className="mt-4">
                      <PermitsPanel
                        leadId={lead.id}
                        initial={readPermits(lead.permits)}
                        configured={permitsConfigured()}
                        searchUrl={permitSearchUrl(lead)}
                        roofHint={roofAgeHint(savedProperty?.yearBuilt ?? null, savedProperty?.effectiveYear ?? null)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </Section>

            <div className="border-t border-line pt-4">
              <DriversEditor initial={parseDrivers(lead.drivers)} />
            </div>

            <div>
              <VehiclesEditor
                initial={listedVehicles}
                fromVendor={vendorVehicles.length > 0}
              />
              {listedDrivers.length ? (
                <p className="mt-3 text-xs text-faint">
                  Drivers listed by {lead.vendor?.name ?? "the lead source"}:{" "}
                  {listedDrivers.join(" · ")}
                </p>
              ) : null}
            </div>

            <Section title="Policy" icon={<FileText size={15} />}>
              <div>
                <label className="label">Product</label>
                <select name="product" defaultValue={v(lead.product)} className="input">
                  <option value="">—</option>
                  {productOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Premium ($)" name="premium" defaultValue={lead.premium != null ? String(lead.premium) : ""} />
              <Field label="Carrier" name="carrier" defaultValue={v(lead.carrier)} />
              <Field
                label="Current policy number"
                name="externalId"
                defaultValue={v(lead.externalId)}
                className="sm:col-span-1"
              />
              <Field label="New policy number" name="policyNumber" defaultValue={v(lead.policyNumber)} />
              <Field label="Effective date" name="effectiveDate" defaultValue={v(lead.effectiveDate)} />
              <Field
                label="Current carrier"
                name="currentCarrier"
                defaultValue={v(lead.currentCarrier)}
              />
              <Field
                label="X-date (current policy expires)"
                name="policyExpiresAt"
                type="date"
                defaultValue={lead.policyExpiresAt ? lead.policyExpiresAt.toISOString().slice(0, 10) : ""}
              />
              <Field label="Date of birth" name="dob" defaultValue={v(lead.dob)} />
              <Field label="Marital status" name="maritalStatus" defaultValue={v(lead.maritalStatus)} />
              <div className="sm:col-span-2">
                <label className="label">Internal notes</label>
                <textarea
                  name="notes"
                  defaultValue={v(lead.notes)}
                  rows={3}
                  className="input resize-y"
                  placeholder="Notes that stay on this lead…"
                />
              </div>
            </Section>

            <div className="flex items-center justify-between border-t border-line pt-4">
              {isAdmin ? <DeleteLeadButton leadId={lead.id} /> : <span />}
              <button type="submit" className="btn btn-primary">
                Save changes
              </button>
            </div>
          </form>

          {lead.rawPayload ? (
            <details className="mt-6 border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-medium text-muted hover:text-ink">
                Raw lead data from source
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-surface-2 p-4 font-mono text-xs text-ink-2">
                {JSON.stringify(lead.rawPayload, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>

        {/* Documents — its own card rather than buried halfway down a form
            nobody scrolls through. */}
        <div className="card p-6 lg:order-last lg:col-span-2">
          <DocumentsPanel
            leadId={lead.id}
            configured={storageConfigured()}
            documents={documents.map((d) => ({
              id: d.id,
              filename: d.filename,
              kind: d.kind,
              contentType: d.contentType,
              sizeBytes: d.sizeBytes,
              uploadedAt: d.uploadedAt.toISOString(),
              uploadedBy: d.uploadedById ? (teamById.get(d.uploadedById) ?? null) : null,
            }))}
          />
        </div>

        {/* Activity */}
        <div className="card flex flex-col p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">Activity</h2>

          <SendText leadId={lead.id} allowed={smsConfigured() && canText(lead)} />
          <LogActivity leadId={lead.id} />

          <form action={addNote.bind(null, lead.id)} className="mb-5">
            <textarea
              name="body"
              rows={2}
              required
              placeholder="Log a call or add a note…"
              className="input resize-y"
            />
            <button type="submit" className="btn btn-secondary mt-2 w-full">
              Add note
            </button>
          </form>

          <ol className="space-y-4">
            {lead.activities.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                  {activityIcon(a.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-2">{a.body}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {a.user ? `${a.user.name} · ` : ""}
                    {timeAgo(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  className,
  action,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="label">{label}</label>
        {action}
      </div>
      <input type={type} name={name} defaultValue={defaultValue} className="input" />
    </div>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case "STATUS_CHANGE":
      return <ActivityIcon size={14} />;
    case "ASSIGNMENT":
      return <ArrowRightLeft size={14} />;
    case "CALL":
      return <PhoneCall size={14} />;
    case "SMS":
      return <MessageSquare size={14} />;
    case "DNC":
      return <PhoneOff size={14} />;
    case "CREATED":
    case "IMPORTED":
      return <Calendar size={14} />;
    default:
      return <FileText size={14} />;
  }
}
