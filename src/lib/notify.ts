import { db } from "./auth";
import { sendEmail } from "./email";

/**
 * Tells an agent a lead just landed in their queue.
 *
 * First contact currently averages 40 hours because nothing announces a new
 * lead — it auto-assigns and waits to be noticed. Internet leads go cold in
 * minutes, so this is the cheapest possible alarm bell.
 */
export async function notifyNewLead(leadId: string): Promise<void> {
  try {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      include: { assignedTo: true, vendor: true },
    });
    if (!lead?.assignedTo?.email || !lead.assignedTo.active) return;

    const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "A new lead";
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const url = `${base}/leads/${lead.id}`;
    const source = lead.vendor?.name ?? lead.source ?? "a new source";
    const first = (lead.assignedTo.name ?? "").split(" ")[0] || "there";

    const facts: [string, string | null][] = [
      ["Phone", lead.phone],
      ["Email", lead.email],
      ["Product", lead.product],
      ["Location", [lead.city, lead.state].filter(Boolean).join(", ") || null],
      ["Source", source],
    ];

    const rows = facts
      .filter(([, v]) => v)
      .map(
        ([k, v]) =>
          `<tr><td style="padding:3px 12px 3px 0;color:#86868b;font-size:14px;">${k}</td><td style="padding:3px 0;color:#1d1d1f;font-size:14px;font-weight:500;">${escapeHtml(String(v))}</td></tr>`,
      )
      .join("");

    await sendEmail({
      to: lead.assignedTo.email,
      subject: `New lead: ${name}${lead.city ? ` — ${lead.city}` : ""}`,
      html: `
      <div style="background:#f5f5f7;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:460px;margin:0 auto;background:#ffffff;border-radius:18px;border:1px solid #e3e3e6;overflow:hidden;">
          <div style="padding:24px 30px 4px;">
            <div style="font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#0071e3;">New lead assigned to you</div>
            <div style="font-size:21px;font-weight:600;color:#1d1d1f;margin-top:6px;">${escapeHtml(name)}</div>
          </div>
          <div style="padding:10px 30px 24px;">
            <table style="border-collapse:collapse;margin-bottom:18px;">${rows}</table>
            <a href="${url}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:980px;">Open the lead</a>
            <p style="font-size:13px;color:#86868b;line-height:1.5;margin:18px 0 0;">
              Internet leads go cold fast — the first few minutes matter more than the next few days.
            </p>
          </div>
        </div>
      </div>`,
    });
  } catch (err) {
    console.error("[notify] new lead alert failed", leadId, err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
