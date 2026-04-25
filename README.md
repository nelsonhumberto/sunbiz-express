# Sunbiz Express

> A modern, transparent web application for forming Florida LLCs and Corporations — built end-to-end from a comprehensive set of handoff documents.

**Live demo flow:** Sign up → 12-step wizard with real-time Sunbiz name availability → mock checkout → state filing simulation → document generation → admin status advancement → compliance calendar.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) + React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui-style primitives |
| Database | Prisma ORM + SQLite (one-line swap to Postgres) |
| Auth | NextAuth (Auth.js v5) credentials |
| Forms | react-hook-form + zod |
| Animation | Framer Motion |
| Charts | Recharts |
| Icons | lucide-react |

## What's built

**Marketing site** — Landing page with animated hero, stats bar, feature grid, "how it works", three-tier pricing, transparent comparison vs. LegalZoom/ZenBusiness/Bizee/Northwest, testimonials masonry, FAQ accordion, CTA banner. Plus standalone Pricing, Services, About, FAQ pages and Terms / Privacy / Disclaimer.

**Auth** — Sign up + sign in pages with split-panel layout. NextAuth Credentials provider, bcrypt password hashing, auto sign-in after registration.

**12-Step incorporation wizard** — Each step has its own page route, autosave server actions, animated transitions via Framer Motion, sticky cost sidebar with live recalculation, and step-specific validation. Includes:
- **Live Sunbiz name availability** — debounced API call against ~400-entity local mirror, exact + fuzzy matching, alternative suggestions
- Florida state-specific validation (LLC/Corp suffix rules, P.O. box rejection on registered agents, effective-date range)
- Type-to-sign electronic signatures
- Add-on toggling with bundled-vs-standalone logic

**Mock checkout** — Stripe-style card form with card-brand detection, declined-card simulation (`4000 0000 0000 0002`), success page with filing tracking number, PIN, document downloads.

**Document generation** — On payment success, generates HTML "documents" (Articles of Organization or Articles of Incorporation, Operating Agreement, Filing Receipt), stores them base64-encoded in the DB, and serves them via authenticated download endpoint.

**Dashboard** — Filing cards with progress bars for drafts, status timeline for submitted filings, compliance calendar with annual report deadlines (Jan 1 – May 1), documents list.

**Admin** — KPI cards, filings DataTable with status-advancement button (DRAFT → SUBMITTED → APPROVED), email outbox with iframe-rendered preview, recharts analytics (filings over time, status distribution, tier mix).

## Quick start

```bash
# Install deps (already run if you cloned with deps)
npm install

# Initialize the SQLite database and run migrations
npx prisma migrate deploy

# Seed pricing tiers, services, demo users, sample filing
npm run seed

# Start dev server
npm run dev
```

Visit **http://localhost:3000**.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| User | `demo@inc.demo` | `Demo1234!` |
| Admin | `admin@inc.demo` | `Demo1234!` |

The user account ships with one approved sample filing so the dashboard isn't empty on first visit.

## Walking the happy path

1. **Land** at `/` — observe the animated hero, scroll through features and pricing.
2. **Sign up** at `/sign-up` — split-panel form, fields validated, redirect to dashboard.
3. **Start a filing** — click the CTA on the dashboard. A new draft `Filing` row is created and you're redirected into the wizard.
4. **Walk all 12 steps** — try these exploration paths:
   - Step 2: type `DISNEY ENTERPRISES, LLC` → see the red "exact conflict" badge.
   - Step 2: type `Sunshine Coast Ventures LLC` → see the green available state.
   - Step 6: try a registered agent address with `P.O. Box 123` → blocked.
   - Step 11: toggle add-ons → watch the cost sidebar animate.
5. **Step 12 payment** — defaults pre-filled with `4242 4242 4242 4242` (success). Try `4000 0000 0000 0002` → toast: "Card declined."
6. **Success page** at `/checkout/success?filing=...` — shows tracking #, PIN, PDF download links.
7. **Dashboard** — your new filing now appears as **In Review**.
8. **Sign in as admin** (`admin@inc.demo`) → `/admin/filings` → click **Approve** → user receives the `FILING_APPROVED` mock email (visible at `/admin/outbox`).
9. **Back as user** — filing now shows **Approved** with a generated annual-report deadline in the compliance calendar.

## Project structure

```
.
├── app/
│   ├── (marketing)/    landing, pricing, services, about, faq
│   ├── (legal)/        terms, privacy, disclaimer
│   ├── (auth)/         sign-in, sign-up
│   ├── (app)/          dashboard, filings/[id], wizard, checkout
│   ├── (admin)/        admin overview, filings, outbox, analytics
│   ├── api/            auth/[...nextauth], sunbiz/name-check, documents/[id]
│   ├── layout.tsx
│   └── globals.css
├── actions/            server actions (auth, wizard, filings, payments, admin)
├── components/
│   ├── ui/             shadcn-style primitives (button, card, input, …)
│   ├── marketing/      hero, pricing table, comparison, testimonials, …
│   ├── wizard/         WizardShell, NameCheckWidget, AddressForm, steps/
│   ├── dashboard/      DashboardNav, StatusBadge
│   └── admin/          AdminNavLink
├── lib/
│   ├── db.ts           prisma client singleton
│   ├── auth.ts         NextAuth config
│   ├── florida.ts      state-specific rules + validators
│   ├── pricing.ts      tier + add-on catalog + cost calculator
│   ├── sunbiz-mock.ts  in-memory name availability check
│   ├── stripe-mock.ts  mock checkout
│   ├── email-mock.ts   mock email sender (writes to DB)
│   ├── pdf.ts          HTML "PDF" document generator
│   └── wizard-constants.ts
├── data/
│   └── sunbiz-seed.json  ~400 fake FL entities (incl. DISNEY, APPLE, …)
├── prisma/
│   ├── schema.prisma   14 models matching the handoff
│   ├── migrations/
│   └── seed.ts
└── scripts/
    └── generate-sunbiz-seed.ts
```

## Florida-specific logic encoded

| Rule | Where |
|---|---|
| LLC name must end with `LLC`, `L.L.C.`, or `Limited Liability Company` | `lib/florida.ts` |
| Corporation suffix: `Corp`, `Corporation`, `Inc`, `Incorporated`, `Co`, `Company` | `lib/florida.ts` |
| Registered agent must have a Florida physical address (no P.O. Box) | `lib/florida.ts` + Step 6 |
| LLC filing fee $125 ($100 + $25 RA designation) | `lib/florida.ts` |
| Corporation filing fee $70 ($35 + $35 RA designation) | `lib/florida.ts` |
| Annual report due Jan 1 – May 1; LLC $138.75, Corp $150 | `lib/florida.ts` + compliance page |
| $400 non-waivable late fee after May 1 | Compliance UI copy |
| Effective date can be -5 to +90 days | Step 9 |
| Entities formed Oct 1 – Dec 31 defer first annual report | `computeNextAnnualReport()` |

## Mocked vs real

This is a single-session demo, so the following are **mocked** with realistic UI:

| Service | Real impl | Mock impl |
|---|---|---|
| Stripe payments | `stripe.PaymentIntent.create()` | Card form + `Payment` row |
| SunBiz e-filing | Playwright headless browser at `efile.sunbiz.org/llc_file.html` | Status transitions via admin button |
| Sunbiz name search | `cloudscraper` + Cloudflare bypass against `search.sunbiz.org` | Local 400-entity JSON with exact + fuzzy matching |
| SendGrid email | API call with template ID | DB row + admin Outbox iframe preview |
| AWS S3 documents | Pre-signed URLs to S3 | Base64 stored in `Document.base64` |
| Namecheap domains | API.checkDomains | Not implemented (UI only) |

Real implementations are signposted in code comments. Swapping any one of them is a localized change — the data flow and contracts already match what production would need.

## Things deliberately out of scope

- Real third-party API credentials (Stripe / SendGrid / Namecheap)
- Playwright automation against efile.sunbiz.org (requires sandbox account + headless browser infra)
- BOI / FinCEN beneficial ownership reports
- Multi-state expansion (FL only — other states show "Coming soon")
- SMS / 2FA
- Background job queues (Celery / Redis / BullMQ — admin button substitutes)
- Live chat widget / Intercom
- A/B testing framework

## Reset commands

```bash
# Reset DB and reseed
rm prisma/dev.db && npx prisma migrate deploy && npm run seed

# Regenerate sunbiz seed JSON (393 entities)
npx tsx scripts/generate-sunbiz-seed.ts
```

## Notes for production deployment

1. Swap SQLite → Postgres: change `provider` in `prisma/schema.prisma` and update `DATABASE_URL`.
2. Replace mock services in `lib/{stripe,email,sunbiz,pdf}-mock.ts` with real SDKs.
3. Add a real auth provider (Google OAuth, magic link, etc.) in `lib/auth.ts`.
4. Move document storage from base64-in-DB to S3 with pre-signed URLs.
5. Add background job queue (Celery / Inngest / BullMQ) for: email sending, e-filing automation, abandonment reminders, compliance alerts.
6. Wire up Sentry / DataDog / Mixpanel.
7. Set up Playwright automation against efile.sunbiz.org with proxy rotation.

---

Built from `incorporation_app_developer_guide.md`, `incorporation_app_quick_reference.md`, plus the four research documents in `Research/incorporation_research/`.
