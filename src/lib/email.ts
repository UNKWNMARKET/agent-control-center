// Lightweight email sending via Resend's HTTP API (no SDK dependency).
// Set RESEND_API_KEY and RESET_EMAIL_FROM to enable real delivery.

type Attachment = { filename: string; content: string; contentType?: string };
type SendArgs = { to: string; subject: string; html: string; attachments?: Attachment[] };

export async function sendEmail({ to, subject, html, attachments }: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESET_EMAIL_FROM || "Agent Control Center <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped sending "${subject}" to ${to}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from, to, subject, html,
        // Resend takes base64 content; an .ics attachment is what makes
        // Outlook offer to put the reminder on the calendar.
        ...(attachments?.length
          ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, content_type: a.contentType })) }
          : {}),
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}

export function followUpReminderEmail(args: {
  agentFirstName: string;
  leadName: string;
  when: string;
  phone?: string | null;
  leadUrl: string;
}) {
  const subject = `Follow-up ${args.when}: ${args.leadName}`;
  const html = `
  <div style="background:#f5f5f7;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:18px;border:1px solid #e3e3e6;overflow:hidden;">
      <div style="padding:26px 32px 6px;"><div style="font-size:18px;font-weight:600;color:#1d1d1f;">Follow-up reminder</div></div>
      <div style="padding:6px 32px 26px;">
        <p style="font-size:15px;color:#1d1d1f;margin:0 0 12px;">Hi ${escapeHtml(args.agentFirstName)},</p>
        <p style="font-size:15px;color:#424245;line-height:1.5;margin:0 0 16px;">
          You set a follow-up with <strong>${escapeHtml(args.leadName)}</strong> for <strong>${escapeHtml(args.when)}</strong>.
          The attached invitation puts it on your calendar with a reminder 30 minutes before.
        </p>
        ${args.phone ? `<p style="font-size:15px;color:#424245;margin:0 0 16px;">Phone: ${escapeHtml(args.phone)}</p>` : ""}
        <a href="${args.leadUrl}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:980px;">Open the lead</a>
      </div>
    </div>
  </div>`;
  return { subject, html };
}

export function passwordResetEmail(name: string, link: string) {
  const subject = "Reset your Agent Control Center password";
  const html = `
  <div style="background:#f5f5f7;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:18px;border:1px solid #e3e3e6;overflow:hidden;">
      <div style="padding:28px 32px 8px;">
        <div style="font-size:18px;font-weight:600;color:#1d1d1f;">Agent Control Center</div>
      </div>
      <div style="padding:8px 32px 28px;">
        <p style="font-size:15px;color:#1d1d1f;margin:0 0 12px;">Hi ${escapeHtml(
          name.split(" ")[0] || "there",
        )},</p>
        <p style="font-size:15px;color:#424245;line-height:1.5;margin:0 0 20px;">
          We received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.
        </p>
        <a href="${link}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:980px;">
          Reset password
        </a>
        <p style="font-size:13px;color:#86868b;line-height:1.5;margin:22px 0 0;">
          If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#86868b;margin:18px 0 0;">Agent Control Center · Authorized staff only</p>
  </div>`;
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
