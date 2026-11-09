# Standing the platform up

Everything below is done once. The secrets are pasted by you — they open a
door to the whole platform, so they are never typed into a chat.

## 1. Environment variables in Vercel

Vercel project `agent-control-center`, Settings → Environment Variables. Add
each to **Production, Preview and Development**.

| Name | Where it comes from |
|---|---|
| `DATABASE_URL` | Supabase → project `agent-control-center` → Connect → **Transaction pooler** |
| `DIRECT_URL` | the same page → **Direct connection** |
| `SESSION_SECRET` | generate your own, see below |
| `SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` |
| `NEXT_PUBLIC_APP_URL` | the site's address, e.g. `https://agentcontrolcenter.com` |
| `RESEND_API_KEY` | Resend, for invitation and reminder emails |

The two connection strings carry the database password. Copy them straight
from Supabase into Vercel.

To generate `SESSION_SECRET`, run this and paste the line it prints:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Without `RESEND_API_KEY` nothing breaks — invitations simply aren't emailed.
Both the owner console and the bootstrap script show the link on screen, so
you can pass it on yourself.

## 2. The first account

Once `DATABASE_URL` is set locally in `.env`, run:

```
node scripts/bootstrap-owner.mjs "Your Agency Name" "Your Name" you@example.com
```

It prints an invitation link. Follow it, choose a password, and that account
becomes the platform owner — the only one that sees the Agencies console.
The password is chosen by you and known to nobody else, including this
repository.

After that, every further agency is created from **Agencies** in the app.

## 3. Each agency, once they're on

Their admin signs in and sets up:

- **Team** — invites their own staff, each choosing their own password
- **Integrations** — their lead sources, each with its own webhook URL and
  token to hand to the vendor
- **Settings** — their phone system for click-to-call and click-to-text

Ownership and homestead lookups need nothing configured; they run on every
record from the Florida state tax roll.

## What suspending does

Stops their logins and makes their lead sources refuse new leads. Nothing is
deleted and nothing is lost — recording a payment puts them straight back.
