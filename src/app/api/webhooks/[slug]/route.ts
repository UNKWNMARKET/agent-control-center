import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { timingSafeEqual } from "crypto";
import { unscopedDb, dbFor } from "@/lib/db";
import { normalizeLead } from "@/lib/leads";
import { scrubFields } from "@/lib/dnc";
import { pickNextAssignee } from "@/lib/settings";
import { maybeSendInitialSms } from "@/lib/sms";
import { lookupNewLead } from "@/app/actions/property";
import { notifyNewLead } from "@/lib/notify";

// Lead carriers (EverQuote, AllWebLeads, Smart Financial, ...) POST leads here.
// URL:  POST /api/webhooks/<vendor-slug>?token=<webhook-token>
// The token may also be sent as the `x-webhook-token` header or a Bearer token.

export const dynamic = "force-dynamic";

function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function extractToken(req: NextRequest): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const header = req.headers.get("x-webhook-token");
  if (header) return header;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

async function readPayload(req: NextRequest): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};

  // Include any query-string fields (some ping-post integrations use them).
  const url = new URL(req.url);
  for (const [k, v] of url.searchParams.entries()) {
    if (k.toLowerCase() !== "token") payload[k] = v;
  }

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      Object.assign(payload, await req.json());
    } else if (
      ct.includes("application/x-www-form-urlencoded") ||
      ct.includes("multipart/form-data")
    ) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) {
        payload[k] = typeof v === "string" ? v : (v as File).name;
      }
    } else {
      const text = await req.text();
      if (text) {
        try {
          Object.assign(payload, JSON.parse(text));
        } catch {
          const sp = new URLSearchParams(text);
          for (const [k, v] of sp.entries()) payload[k] = v;
        }
      }
    }
  } catch {
    // Tolerate empty / unparseable bodies — query params may still carry data.
  }

  return payload;
}

/**
 * Which agency this lead belongs to.
 *
 * The token decides, not the slug. Two agencies can both call a source
 * "everquote", so the slug is no longer unique on its own — but the token is
 * unique, secret, and issued to exactly one agency. Resolving by token first
 * means a lead can only ever land in the agency that handed out that token,
 * even if it is posted to the wrong URL.
 */
async function resolveVendor(slug: string, token: string | null) {
  if (!token) return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) };

  const vendor = await unscopedDb.vendor.findUnique({ where: { webhookToken: token } });
  if (!vendor || !tokensMatch(token, vendor.webhookToken))
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) };
  if (vendor.slug !== slug)
    return { error: NextResponse.json({ error: "Unknown vendor" }, { status: 404 }) };
  if (!vendor.active)
    return { error: NextResponse.json({ error: "Vendor is disabled" }, { status: 403 }) };

  // A suspended agency stops receiving leads rather than quietly collecting
  // them: better the source retries than the agency loses them unseen.
  const agency = await unscopedDb.agency.findUnique({ where: { id: vendor.agencyId } });
  if (!agency || agency.status !== "ACTIVE")
    return { error: NextResponse.json({ error: "Account inactive" }, { status: 403 }) };

  return { vendor, db: dbFor(vendor.agencyId) };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const { vendor, db, error } = await resolveVendor(slug, extractToken(req));
  if (error) return error;

  const payload = await readPayload(req);
  const n = normalizeLead(payload);

  if (!n.firstName && !n.lastName && !n.phone && !n.email) {
    return NextResponse.json(
      { error: "Payload missing a name, phone, or email" },
      { status: 422 },
    );
  }

  // Automatically scrub the phone against the Do-Not-Call list(s).
  const dnc = await scrubFields(n.phone, db);
  const assignedToId = await pickNextAssignee(db);

  const lead = await db!.lead.create({
    data: {
      assignedToId,
      firstName: n.firstName ?? null,
      lastName: n.lastName ?? null,
      email: n.email ?? null,
      phone: n.phone ?? null,
      phoneSecondary: n.phoneSecondary ?? null,
      address1: n.address1 ?? null,
      address2: n.address2 ?? null,
      city: n.city ?? null,
      state: n.state ?? null,
      zip: n.zip ?? null,
      dob: n.dob ?? null,
      maritalStatus: n.maritalStatus ?? null,
      product: n.product ?? null,
      premium: n.premium ?? null,
      // X-dates are entered by the team, not taken from the vendor feed — the
      // renewals board is meant to hold dates someone has actually confirmed.
      // The vendor's own value stays in rawPayload if it's ever wanted.
      currentCarrier: n.currentCarrier ?? null,
      externalId: n.externalId ?? null,
      source: vendor!.name,
      rawPayload: payload as object,
      vendorId: vendor!.id,
      ...dnc,
      activities: { create: { type: "CREATED", body: `Received via ${vendor!.name} webhook` } },
    },
  });

  await maybeSendInitialSms(lead.id, db);

  // Pull the property record after the vendor gets its 201 — a slow tax-roll
  // lookup must never delay (or fail) lead delivery.
  after(() => lookupNewLead(lead.id, vendor!.agencyId));
  // Tell the agent it landed — nothing else does.
  if (assignedToId) after(() => notifyNewLead(lead.id, vendor!.agencyId));

  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
}

// Lets vendors (and you) verify the endpoint is live and the token is valid.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const { vendor, db, error } = await resolveVendor(slug, extractToken(req));
  if (error) return error;
  return NextResponse.json({
    ok: true,
    vendor: vendor!.name,
    message: "Webhook endpoint is live. POST leads to this URL.",
  });
}
