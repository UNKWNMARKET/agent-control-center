import { db } from "./auth";
import { getSetting } from "./settings";
import { normalizePhone } from "./dnc";

export const DEFAULT_INITIAL_SMS =
  "Hi {firstName}, this is {agency}. Thanks for requesting an insurance quote — I'd love to help you find the best rate. What's a good time to connect? Reply STOP to opt out.";
export const DEFAULT_FOLLOWUP_SMS =
  "Hi {firstName}, following up from {agency} about your insurance quote — still happy to help you save. Reply STOP to opt out.";

export function renderSms(
  tpl: string,
  lead: { firstName?: string | null; lastName?: string | null },
  agency: string,
): string {
  return tpl
    .replace(/\{firstName\}/g, lead.firstName || "there")
    .replace(/\{lastName\}/g, lead.lastName || "")
    .replace(/\{agency\}/g, agency);
}

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

/** Send one SMS via Twilio. No-op (returns false) until Twilio env vars are set. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.warn(`[sms] Twilio not configured — skipped text to ${to}`);
    return false;
  }
  const phone = normalizePhone(to);
  if (!phone) return false;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: `+1${phone}`, From: from, Body: body }).toString(),
      },
    );
    if (!res.ok) {
      console.error("[sms] Twilio error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sms] send failed", err);
    return false;
  }
}

/** May this lead be texted right now? (consent/compliance guardrails) */
export function canText(lead: {
  phone: string | null;
  dncStatus: string;
  status: string;
  smsOptOut: boolean;
}): boolean {
  return (
    Boolean(lead.phone) &&
    lead.dncStatus !== "BLOCKED" &&
    lead.status !== "DNC" &&
    !lead.smsOptOut
  );
}

/** Send the initial auto-text to a brand-new lead (best effort; never throws). */
export async function maybeSendInitialSms(leadId: string): Promise<void> {
  try {
    if ((await getSetting("sms_automation")) !== "on" || !smsConfigured()) return;
    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.initialSmsAt || !canText(lead)) return;
    const agency = (await getSetting("agency_name")) || "your agent";
    const tpl = (await getSetting("sms_template_initial")) || DEFAULT_INITIAL_SMS;
    const body = renderSms(tpl, lead, agency);
    if (await sendSms(lead.phone!, body)) {
      await db.lead.update({
        where: { id: leadId },
        data: {
          initialSmsAt: new Date(),
          activities: { create: { type: "SMS", body: `Auto-text sent: ${body}` } },
        },
      });
    }
  } catch (err) {
    console.error("[sms] initial send failed", err);
  }
}
