# Deploying Sunbiz Express

> Stack: **Next.js on Vercel + Postgres on Supabase + code on GitHub.** All free for hobby use.

## TL;DR

```
GitHub repo  ─┐
              ├─ Vercel (auto-deploys on push)
Supabase DB  ─┘
```

Total time: **~10 minutes** if you have accounts on all three.

---

## Step 1 — Create the Supabase project

1. Sign up / sign in at [supabase.com](https://supabase.com).
2. **New project** → name it `sunbiz-express` → pick a region close to you (`us-east-1` is fine for FL traffic) → set a strong database password (save it).
3. Wait ~2 minutes for the project to provision.
4. Go to **Settings → Database**.
5. Copy two connection strings:
   - **Connection pooling → Transaction mode** (port `6543`) — this is your `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=1` to the end if it isn't already there.
   - **Connection string → URI** (port `5432`, the direct one) — this is your `DIRECT_URL`.

Both look like:
```
postgresql://postgres.abcdefgh:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Replace `YOUR_PASSWORD` with the password you set in step 2.

> **Why two URLs?** Serverless functions can't keep persistent Postgres connections open, so Supabase routes them through pgbouncer (port 6543). But Prisma migrations need a direct connection (port 5432) to run DDL.

---

## Step 2 — Push the code to GitHub

If you haven't already:

```bash
gh auth login                 # one-time, browser flow
git init
git add .
git commit -m "Initial Sunbiz Express commit"
gh repo create sunbiz-express --public --source=. --remote=origin --push
```

The repo lives at `https://github.com/YOUR_USERNAME/sunbiz-express`.

---

## Step 3 — Create the Vercel project

### 3a. Import from GitHub

1. Sign in at [vercel.com](https://vercel.com) (use "Continue with GitHub" — it auto-syncs your repos).
2. **Add New → Project → Import** the `sunbiz-express` repo.
3. Vercel auto-detects Next.js. Don't change Build/Output settings.
4. **Don't deploy yet** — first add env vars (Step 3b).

### 3b. Environment variables

Click **Environment Variables** and add four:

| Name | Value |
|---|---|
| `DATABASE_URL` | Pooled connection string from Supabase (port 6543, with `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Direct connection string from Supabase (port 5432) |
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` locally and paste the result |
| `NEXTAUTH_URL` | Leave blank for now — fill in after first deploy |

Apply to **Production, Preview, Development** for each.

### 3c. Deploy

Click **Deploy**. The first build runs:
- `prisma generate` (Prisma client)
- `prisma migrate deploy` (applies migrations to Supabase — creates all 14 tables)
- `next build` (compiles the app)

If migrations fail with "no migration files found," that's because we haven't generated them locally yet. See **Step 4**.

After deploy succeeds, go to **Settings → Domains** to find your URL (e.g. `sunbiz-express-abc123.vercel.app`). Set `NEXTAUTH_URL` env var to that URL (with `https://`) and redeploy.

---

## Step 4 — Run the initial migration

Migrations live in `prisma/migrations/`. They're committed to git. If we don't have any yet, generate one locally first:

```bash
# Locally — uses .env values
npm install
npx prisma migrate dev --name init
git add prisma/migrations/
git commit -m "Add initial Postgres migration"
git push
```

Vercel auto-redeploys on push. The build step now runs `prisma migrate deploy` against Supabase.

> **Tip:** If you don't want to install Postgres locally, skip the local migrate step and instead use **Supabase SQL Editor** to run `prisma db push` from your machine pointed at `DIRECT_URL`. Either way, the schema ends up in Supabase.

---

## Step 5 — Seed the database

Once the schema is in Supabase, populate pricing tiers, services, demo users, and the sample filing. From your local machine:

```bash
# Pull production env vars to .env.local
vercel env pull .env.local

# Run the seed script against Supabase
npm run seed
```

Now visit your live site and sign in:

| Role | Email | Password |
|---|---|---|
| User | `demo@inc.demo` | `Demo1234!` |
| Admin | `admin@inc.demo` | `Demo1234!` |

---

## Step 6 — (Optional) Custom domain

In Vercel **Settings → Domains**, click **Add** and enter your domain (e.g. `sunbizexpress.com`). Vercel shows you the DNS records to point at:

- **A record:** `76.76.21.21`
- **CNAME (`www`):** `cname.vercel-dns.com`

Vercel issues a free SSL cert via Let's Encrypt within ~60 seconds of DNS propagation. Update `NEXTAUTH_URL` to the new domain and redeploy.

---

## Auto-deployment going forward

Every `git push` to the `main` branch → Vercel rebuilds → live in ~90 seconds. Every PR gets its own preview URL with the same env vars. No CI config needed.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: Can't reach database server` during build | `DIRECT_URL` is wrong or Supabase project is paused (auto-pauses after 1 week of no traffic on free tier). Open Supabase dashboard to wake it. |
| `prepared statement "s0" already exists` at runtime | `DATABASE_URL` is missing `?pgbouncer=true`. Add it. |
| Sign-in returns 500 in production | `NEXTAUTH_SECRET` not set, or `NEXTAUTH_URL` doesn't match your actual domain. |
| Hydration warnings about `<body>` | Browser extensions (Grammarly etc.) — already suppressed via `suppressHydrationWarning`. Safe to ignore. |
| Slow cold starts | Free tier limitation. Upgrade Vercel + Supabase or pre-warm with a cron. |

---

## What's NOT in this deploy

These are still mocked (per the original handoff scope):
- Real Stripe payments → mock card form
- Real SunBiz e-filing → admin "advance status" button
- Real SendGrid email → DB-backed mock outbox
- Real S3 document storage → base64 in DB

To wire any of them up: replace the corresponding `lib/*-mock.ts` with the real SDK and add the API keys to Vercel env vars. The rest of the app already speaks the right contract.
