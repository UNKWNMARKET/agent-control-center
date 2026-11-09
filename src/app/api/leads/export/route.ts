import { NextResponse, type NextRequest } from "next/server";
import type { Prisma, LeadStatus } from "@prisma/client";
import { db } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { LEAD_STATUSES } from "@/lib/leads";
import { formatPhone } from "@/lib/utils";
import { leadIdsByPhone } from "@/lib/phone-search";

export const dynamic = "force-dynamic";

function esc(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const isAdmin = user.role === "ADMIN";

  // Mirror the filters used on the leads page so the export matches what's on screen.
  const where: Prisma.LeadWhereInput = {};
  if (!isAdmin) where.assignedToId = user.id;

  const status = sp.get("status");
  if (status && LEAD_STATUSES.includes(status as LeadStatus)) {
    where.status = status as LeadStatus;
  }
  const vendor = sp.get("vendor");
  if (vendor) where.vendorId = vendor;
  if (isAdmin) {
    const assignee = sp.get("assignee");
    if (assignee) where.assignedToId = assignee === "unassigned" ? null : assignee;
  }
  const dnc = sp.get("dnc");
  if (dnc === "OK" || dnc === "BLOCKED" || dnc === "UNKNOWN") where.dncStatus = dnc;
  const fu = sp.get("followup");
  if (fu === "due") where.followUpAt = { not: null, lte: new Date() };
  else if (fu === "scheduled") where.followUpAt = { not: null };
  const tag = sp.get("tag");
  if (tag) where.tags = { has: tag };
  const q = sp.get("q");
  if (q) {
    // Same matching as the list it exports — see lib/phone-search.
    const phoneIds = await leadIdsByPhone(q, 10000);
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { policyNumber: { contains: q, mode: "insensitive" } },
      ...(phoneIds.length ? [{ id: { in: phoneIds } }] : []),
    ];
  }

  const leads = await db.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { vendor: true, assignedTo: true },
    take: 10000,
  });

  const headers = [
    "First Name", "Last Name", "Phone", "Email", "Address", "City", "State", "Zip",
    "Product", "Status", "Source", "Assigned To", "DNC", "Tags", "Follow-up",
    "Premium", "Carrier", "Policy #", "Effective Date", "Created",
  ];

  const lines = [headers.map(esc).join(",")];
  for (const l of leads) {
    lines.push(
      [
        l.firstName, l.lastName, formatPhone(l.phone), l.email, l.address1, l.city,
        l.state, l.zip, l.product, l.status, l.vendor?.name ?? l.source ?? "",
        l.assignedTo?.name ?? "", l.dncStatus, l.tags.join("; "),
        l.followUpAt ? l.followUpAt.toISOString().slice(0, 10) : "",
        l.premium ?? "", l.carrier, l.policyNumber, l.effectiveDate,
        l.createdAt.toISOString().slice(0, 10),
      ]
        .map(esc)
        .join(","),
    );
  }
  const csv = lines.join("\r\n");
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
    },
  });
}
