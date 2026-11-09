# Lead Management

A modern, Apple-clean lead management platform for an insurance agency — built for the owner and staff. Leads flow in automatically from lead carriers (EverQuote, AllWebLeads, Smart Financial, and any other source you add) via secure webhooks, plus CSV import. Admins can see, assign, and delete every lead; staff work the leads assigned to them.

Built with **Next.js 16**, **TypeScript**, **Tailwind CSS**, **Prisma**, and **Supabase Postgres**. Deploys to **Vercel**.

---

## ✨ Features

- **Secure sign-in** with admin and staff (agent) roles, signed session cookies, and bcrypt-hashed passwords.
- **Dashboard** — pipeline overview, weekly intake, conversion, and recent leads (scoped per user).
- **Leads** — fast search and filtering (status, source, assignee), inline status changes, and a full lead record with an activity timeline and notes.
- **Admin controls** — assign or reassign any lead, bulk-assign, and delete leads from any user.
- **Team management** — add staff, set roles, reset passwords, activate/deactivate, and remove users.
- **Integrations** — every lead source gets a private webhook URL. Paste it into the carrier's portal and leads arrive in real time.
- **CSV import** — drag in a spreadsheet exported from any carrier; columns are auto-detected and mapped.

## 🔐 Your admin login

| | |
|---|---|
| **Email** | `eisdorferjesse@gmail.com` |
| **Password** | the one you provided (change it under **Account** after first sign-in) |

> Security tip: change this password after your first login (**Account → Change password**). Add staff under **Team**.

---

## 🚀 Run it locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The `.env` file (already created on your machine, git-ignored) holds the database connection and session secret.

> The database (schema, your admin account, and the three vendors) is already set up in your Supabase project **“UNKWNMARKET's lead manager.”**

> **No Node on the machine?** A portable copy lives at
> `C:\Users\eisdo\projects\.toolchain\node-v24.19.0-win-x64`. Prepend it to `PATH`
> for the session: `$env:Path = "C:\Users\eisdo\projects\.toolchain\node-v24.19.0-win-x64;$env:Path"`.
> npm 11 skips package install scripts, so run `npx prisma generate` after `npm install`.

## ☁️ Deploy to Vercel

This project now deploys **from Git**: the Vercel project `lead-management` is connected to
`UNKWNMARKET/lead-management`, so every push to `main` builds and promotes to production at
www.floridainsurenow.com. (Before Oct 2026 it was deployed by hand with `vercel deploy`, and the
source existed only inside the deployment bundle.)

Setting it up again from scratch would be:

1. Push this repo to GitHub, then in **Vercel → Add New → Project**, import the repo into your account (`eisdorferjesse-1667s-projects`). Vercel auto-detects Next.js.
2. Add these **Environment Variables** (Settings → Environment Variables):
   - `DATABASE_URL` and `DIRECT_URL` — use the **Transaction pooler** connection string from Supabase (**Project → Connect → ORMs/Prisma**), with user `app_user` and the database password. The pooler is IPv4-friendly and recommended for Vercel. Copy the exact host from that dialog.
   - `SESSION_SECRET` — the long random value from your local `.env`.
   - `NEXT_PUBLIC_APP_URL` — your deployed URL, e.g. `https://your-app.vercel.app`.
3. Deploy. After it’s live, update `NEXT_PUBLIC_APP_URL` to the real URL and redeploy so the webhook URLs shown in **Integrations** are correct.

See [`.env.example`](./.env.example) for the exact variable shapes.

## 🔌 Connect your lead carriers

1. Sign in as admin → **Integrations**. EverQuote, AllWebLeads, and Smart Financial are already there.
2. Each shows a **Webhook URL** like:
   ```
   https://your-app.vercel.app/api/webhooks/everquote?token=whk_xxxxxxxx
   ```
3. Paste that URL into the carrier’s lead-delivery / posting settings (HTTP POST). Leads they send appear instantly under **Leads**.
4. Prefer files? Use **Import** to upload a CSV exported from any carrier — fields are detected automatically.

The webhook accepts JSON or form-encoded posts, normalizes common field names (first name, phone, email, address, product, etc.), and keeps the carrier’s original payload on each lead for reference. Add more sources anytime under **Integrations**.

---

## 🧱 Tech & structure

```
src/
  app/
    (app)/            authenticated pages (dashboard, leads, team, vendors, import, account)
    actions/          server actions (auth, leads, users, vendors)
    api/webhooks/     inbound lead webhook endpoint
    login/            sign-in
  components/         UI (nav, tables, forms, controls)
  lib/                db client, auth/session, password hashing, lead normalizer
  proxy.ts            route protection (Next.js 16 middleware)
prisma/schema.prisma  database schema
```

### Database security model

Tables live in Supabase Postgres with **Row-Level Security on**. The app connects through a dedicated, password-protected `app_user` role (never exposed publicly). Supabase’s public API roles (`anon`/`authenticated`) are revoked and blocked by RLS, so leads and password hashes are unreachable from the public API key. Authorization (admin vs. staff, who can delete/assign) is enforced in the app layer.

### Common commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Production build (runs `prisma generate`) |
| `npm run db:studio` | Open Prisma Studio to browse data |
| `npx prisma migrate dev` | Create/apply a schema change |
