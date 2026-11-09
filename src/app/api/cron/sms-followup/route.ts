import { NextResponse, type NextRequest } from "next/server";
import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { sendSms, smsConfigured, renderSms, DEFAULT_FOLLOWUP_SMS, canText } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs daily (Vercel Cron). Texts leads ~5 days after their initial text if they
// still aren't Sold/Lost/DNC and haven't opted out.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const provided =
      req.nextUrl.searchParams.get("secret") ||
      (auth?.startsWith("Bearer ") ? auth.slice(7) : null);
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if ((await getSetting("sms_automation")) !== "on" || !smsConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, skipped: "automation off or SMS not configured" });
  }

  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
  const leads = await prisma.lead.findMany({
    where: {
      initialSmsAt: { not: null, lte: fiveDaysAgo },
      followupSmsAt: null,
      smsOptOut: false,
      dncStatus: { not: "BLOCKED" },
      status: { notIn: ["SOLD", "LOST", "DNC"] as LeadStatus[] },
      phone: { not: null },
    },
    take: 100,
  });

  const agency = (await getSetting("agency_name")) || "your agent";
  const tpl = (await getSetting("sms_template_followup")) || DEFAULT_FOLLOWUP_SMS;

  let sent = 0;
  for (const lead of leads) {
    if (!canText(lead)) continue;
    const body = renderSms(tpl, lead, agency);
    if (await sendSms(lead.phone!, body)) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          followupSmsAt: new Date(),
          activities: { create: { type: "SMS", body: `Auto follow-up text sent: ${body}` } },
        },
      });
      sent++;
    }
  }

  return NextResponse.json({ ok: true, candidates: leads.length, sent });
}
