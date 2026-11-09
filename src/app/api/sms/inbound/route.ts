import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/dnc";

export const dynamic = "force-dynamic";

// Twilio posts inbound SMS here. A reply of STOP/UNSUBSCRIBE opts the lead out.
export async function POST(req: NextRequest) {
  let from = "";
  let body = "";
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("form")) {
      const fd = await req.formData();
      from = String(fd.get("From") ?? "");
      body = String(fd.get("Body") ?? "");
    } else {
      const j = (await req.json()) as Record<string, string>;
      from = j.From ?? j.from ?? "";
      body = j.Body ?? j.body ?? "";
    }
  } catch {
    /* tolerate */
  }

  const phone = normalizePhone(from);
  const text = body.trim().toUpperCase();
  const isStop = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT|OPT-OUT)\b/.test(text);

  if (phone && isStop) {
    const all = await prisma.lead.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true },
    });
    const ids = all.filter((l) => normalizePhone(l.phone) === phone).map((l) => l.id);
    if (ids.length) {
      await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { smsOptOut: true } });
      await prisma.activity.createMany({
        data: ids.map((leadId) => ({
          leadId,
          type: "SMS" as const,
          body: "Lead replied STOP — opted out of texts",
        })),
      });
    }
  }

  // Empty TwiML so Twilio doesn't auto-reply.
  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
