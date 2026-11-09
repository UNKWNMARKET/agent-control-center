# Agent Control Center — multi-agency edition

A separate product from the agency's own instance at **floridainsurenow.com**.
That one is untouched and keeps running from `../lead-management`. This repo is
the version sold to other agencies for a monthly fee.

## How agencies are kept apart

Every agency shares one database, and every row that belongs to an agency
carries its `agencyId`. The danger in that arrangement is a query that forgets
whose data it is asking for, so forgetting is made impossible rather than
discouraged:

- **`src/lib/db.ts`** — `dbFor(agencyId)` returns a Prisma client that rewrites
  every query on its way through. Reads gain the agency filter, writes gain the
  agency id, `findUnique` becomes `findFirst` so an id lookup cannot skip the
  filter, and `update`/`delete` run as `updateMany`/`deleteMany` and throw if
  they touch nothing — a write aimed at another agency fails loudly.
- **`src/lib/auth.ts`** — `db` is a proxy that resolves the signed-in agency on
  every call. Pages and actions use it exactly like the old client; there is no
  way to write the query that returns everyone's leads.
- **`unscopedDb`** is the raw client. Four callers only: sign-in (has to find a
  user before it knows the agency), password reset, inbound webhooks (identify
  by token), and the owner console (looks across agencies on purpose). The name
  is deliberately ugly so a fifth stands out in review.

Inbound leads are routed by **webhook token, not URL slug**. Two agencies can
both call a source "everquote"; the token is unique and secret, so a lead can
only land in the agency that issued it.

## Done

- Multi-agency schema: `Agency`, `Invite`, `agencyId` throughout, per-agency
  unique constraints, suspended-agency handling
- Scoped database client and the proxy that makes it the default
- Auth carrying the agency, `requireOwner` for the owner console
- Per-agency settings
- Webhook routing by token, refusing leads for a suspended agency
- Phone search scoped (raw SQL, so the filter is written out by hand)

## Still to do

In the order it should be built:

1. **Finish the conversion.** Session-less paths still to convert:
   `api/cron/backup`, `api/cron/sms-followup`, `api/sms/inbound`,
   `lib/backup.ts`, and the helper signatures they call (`scrubFields`,
   `maybeSendInitialSms`, `lookupNewLead`, `notifyNewLead`) which need an
   explicit agency. Until this is done the project does not compile — that is
   intentional: the old `prisma` export was removed so the compiler lists every
   unconverted call site.
2. **Owner console** (`/owner`, platform owner only) — create an agency, set
   its monthly fee and paid-through date, suspend and restore, see usage.
3. **Invites** — the owner invites an agency's first admin; that admin invites
   their own staff. Token hashed, link emailed, expires.
4. **Agency branding** — their name in the corner, on the tab title and on
   emails.
5. **Agency settings page** — phone system (click-to-call and click-to-text),
   lead sources with their webhook URLs, auto-assignment.
6. **Property lookup on every new record** — runs on webhook leads today; make
   it run on manually added leads and customers too, with a retry for the ones
   that fail.
7. **Provision** — database, Vercel project, domain.

## Hosting note

The platform needs its own Supabase project. The organisation is on the free
plan and already has its two free projects, so this needs **Supabase Pro**
(about $25/month). That is the right foundation for a product people pay for
anyway: free projects pause after a week of inactivity, which would take a
paying agency's CRM offline.
