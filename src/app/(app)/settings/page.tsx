import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/auth";
import { getSetting, getMailClient, getPhoneApp } from "@/lib/settings";
import { smsConfigured, DEFAULT_INITIAL_SMS, DEFAULT_FOLLOWUP_SMS } from "@/lib/sms";
import { PageHeader } from "@/components/ui";
import { AutoAssignToggle } from "@/components/settings/auto-assign-toggle";
import { SmsSettings } from "@/components/settings/sms-settings";
import { EmailClientSelect } from "@/components/settings/email-client-select";
import { PropertyBackfill } from "@/components/settings/property-backfill";
import { PhoneAppSelect } from "@/components/settings/phone-app-select";

export const metadata: Metadata = { title: "Settings · Agent Control Center" };

export default async function SettingsPage() {
  await requireAdmin();

  const [autoAssign, agentCount, smsAuto, agencyName, initialTpl, followupTpl, mailClient] =
    await Promise.all([
      getSetting("auto_assign"),
      db.user.count({ where: { active: true, role: "AGENT" } }),
      getSetting("sms_automation"),
      getSetting("agency_name"),
      getSetting("sms_template_initial"),
      getSetting("sms_template_followup"),
      getMailClient(),
    ]);

  const phoneApp = await getPhoneApp();

  const unchecked = await db.lead.count({
    where: { property: { equals: Prisma.DbNull }, address1: { not: null } },
  });

  const inboundUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/sms/inbound`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Agency settings"
        subtitle="Configure how leads flow through your team."
      />

      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-ink">
              Auto-assign incoming leads
            </p>
            <p className="mt-1 text-sm text-muted">
              Distribute new leads (from carrier webhooks and imports) to your active
              agents in round-robin order.{" "}
              {agentCount === 0
                ? "Add active agents under Team to use this."
                : `${agentCount} active agent${agentCount === 1 ? "" : "s"} in rotation.`}
            </p>
          </div>
          <AutoAssignToggle enabled={autoAssign === "on"} />
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[15px] font-semibold text-ink">Backups</p>
        <p className="mt-1 text-sm text-muted">
          Every morning the whole book — customers, policies and the full call and
          note history — is emailed to you as spreadsheets. They open in Excel and
          don&apos;t need this site to read, so the records survive even if the app or
          its database doesn&apos;t.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/api/backup" className="btn btn-secondary">
            <Download size={15} /> Download a backup now
          </a>
          <span className="text-xs text-faint">Emailed daily at 4am Eastern</span>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[15px] font-semibold text-ink">Email links</p>
        <p className="mt-1 text-sm text-muted">
          Clicking a lead&apos;s email address starts a new message to them. Choose what
          opens on your agents&apos; computers.
        </p>
        <div className="mt-4">
          <EmailClientSelect value={mailClient} />
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[15px] font-semibold text-ink">Calling and texting</p>
        <p className="mt-1 text-sm text-muted">
          Clicking a lead&apos;s phone number places the call, and the message icon
          beside it starts a text — both in the app you choose here.
        </p>
        <div className="mt-4">
          <PhoneAppSelect value={phoneApp} />
        </div>
      </div>

      <div className="card p-5">
        <p className="text-[15px] font-semibold text-ink">Property records</p>
        <p className="mt-1 text-sm text-muted">
          Checks each lead&apos;s address against the Florida Department of Revenue tax
          roll for homestead status, owner of record, year built, and living area. New
          leads are checked automatically as they arrive.
        </p>
        <div className="mt-4">
          <PropertyBackfill pending={unchecked} />
        </div>
      </div>

      <SmsSettings
        enabled={smsAuto === "on"}
        configured={smsConfigured()}
        agencyName={agencyName ?? ""}
        initialTpl={initialTpl || DEFAULT_INITIAL_SMS}
        followupTpl={followupTpl || DEFAULT_FOLLOWUP_SMS}
        inboundUrl={inboundUrl}
      />
    </div>
  );
}
