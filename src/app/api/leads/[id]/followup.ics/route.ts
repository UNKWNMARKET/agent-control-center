import { NextResponse } from "next/server";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { buildFollowUpIcs, followUpUid } from "@/lib/calendar";

/**
 * The lead's follow-up as a calendar file. Opening it in Outlook creates the
 * appointment with a reminder — no mail server and no Microsoft sign-in needed.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not authenticated", { status: 401 });

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return new NextResponse("Lead not found", { status: 404 });
  if (user.role !== "ADMIN" && lead.assignedToId !== user.id) {
    return new NextResponse("Not your lead", { status: 403 });
  }
  if (!lead.followUpAt) return new NextResponse("No follow-up set on this lead", { status: 404 });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "this lead";

  const ics = buildFollowUpIcs({
    uid: followUpUid(lead.id),
    date: lead.followUpAt,
    leadName,
    leadUrl: `${base}/leads/${lead.id}`,
    phone: lead.phone,
    notes: lead.notes,
    method: "PUBLISH",
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="follow-up-${leadName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
