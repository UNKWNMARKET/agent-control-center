import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { buildBackup, backupStamp } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily off-site backup (Vercel Cron).
 *
 * Emails the whole book as spreadsheets to the agency's admins. Email is the
 * point: the copy lands somewhere that has nothing to do with this app's
 * hosting or database, so losing either still leaves the records readable.
 */
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

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true, name: true },
  });
  if (admins.length === 0) {
    return NextResponse.json({ ok: false, error: "no active admin to send the backup to" });
  }

  const files = await buildBackup();
  const stamp = backupStamp();
  const totalKb = Math.round(files.reduce((s, f) => s + Buffer.byteLength(f.csv, "utf8"), 0) / 1024);

  const rows = files
    .map(
      (f) =>
        `<tr><td style="padding:2px 14px 2px 0;color:#1d1d1f;font-size:14px;">${f.filename}</td><td style="padding:2px 0;color:#86868b;font-size:14px;">${f.csv.split("\r\n").length - 1} rows</td></tr>`,
    )
    .join("");

  let sent = 0;
  for (const admin of admins) {
    if (!admin.email) continue;
    const ok = await sendEmail({
      to: admin.email,
      subject: `Agent Control Center backup — ${stamp}`,
      html: `
      <div style="background:#f5f5f7;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:18px;border:1px solid #e3e3e6;overflow:hidden;">
          <div style="padding:24px 30px 6px;">
            <div style="font-size:18px;font-weight:600;color:#1d1d1f;">Daily backup — ${stamp}</div>
          </div>
          <div style="padding:6px 30px 26px;">
            <p style="font-size:15px;color:#424245;line-height:1.5;margin:0 0 14px;">
              Attached is the whole book as spreadsheets, ${totalKb} KB in total. They open in
              Excel and don't need the website to read, so keep these somewhere safe.
            </p>
            <table style="border-collapse:collapse;">${rows}</table>
          </div>
        </div>
      </div>`,
      attachments: files.map((f) => ({
        filename: f.filename,
        content: Buffer.from(f.csv, "utf8").toString("base64"),
        contentType: "text/csv",
      })),
    });
    if (ok) sent++;
  }

  return NextResponse.json({ ok: true, sent, files: files.length, totalKb, date: stamp });
}
