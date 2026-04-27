import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail, type NotificationType } from '@/lib/email-mock';

// Recovery + retention scheduler.
//
// Run on a daily cron (Vercel Cron, GitHub Actions, etc). The route is
// idempotent — it inspects the EmailNotification table to make sure the same
// (filing, type) combination is never sent twice. That keeps the implementation
// safe to retry and easy to test by curling locally.
//
// What it sends:
//
//   1. Abandoned-draft recovery — 24h, 72h, and 7d after the last update on a
//      DRAFT filing. We pick the strongest single message in each window so a
//      customer who's been gone 5 days only gets the 24h reminder once, then
//      the 72h "name not reserved" nudge, then the 7d "need help?" message.
//   2. Registered-agent renewal — 60 / 30 / 7 days before the active RA's
//      renewalDate. The first-year service is included with every package, so
//      the renewal cascade introduces the paid renewal upsell at the moment
//      it's most relevant.
//
// Annual report reminders are handled separately — those rely on the
// AnnualReport table and are emitted from the existing compliance flow.

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Mild auth: require a shared secret in either the Vercel-provided
  // `Authorization: Bearer ...` header or a `?secret=` query string. If no
  // secret is configured, allow local development calls.
  if (CRON_SECRET) {
    const url = new URL(request.url);
    const headerSecret =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    const querySecret = url.searchParams.get('secret') ?? '';
    if (headerSecret !== CRON_SECRET && querySecret !== CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const now = Date.now();
  const draftStats = await runDraftRecovery(now);
  const raStats = await runRaRenewalReminders(now);

  return NextResponse.json({ ok: true, drafts: draftStats, raRenewals: raStats });
}

// ─── Draft recovery ───────────────────────────────────────────────────────

const DRAFT_BUCKETS: Array<{
  type: NotificationType;
  minHours: number;
  maxHours: number;
}> = [
  { type: 'ABANDONED_24H', minHours: 24, maxHours: 48 },
  { type: 'ABANDONED_72H', minHours: 72, maxHours: 96 },
  { type: 'ABANDONED_7D', minHours: 24 * 7, maxHours: 24 * 8 },
];

async function runDraftRecovery(now: number) {
  const oldestCutoff = new Date(now - 24 * 8 * 60 * 60 * 1000);
  const newestCutoff = new Date(now - 24 * 60 * 60 * 1000);

  const drafts = await prisma.filing.findMany({
    where: {
      status: 'DRAFT',
      updatedAt: { gte: oldestCutoff, lte: newestCutoff },
    },
    include: { user: true },
  });

  let sent = 0;
  for (const draft of drafts) {
    const ageHours = (now - draft.updatedAt.getTime()) / (60 * 60 * 1000);
    const bucket = DRAFT_BUCKETS.find(
      (b) => ageHours >= b.minHours && ageHours < b.maxHours,
    );
    if (!bucket) continue;

    const alreadySent = await prisma.emailNotification.findFirst({
      where: { filingId: draft.id, notificationType: bucket.type },
      select: { id: true },
    });
    if (alreadySent) continue;

    await sendEmail({
      type: bucket.type,
      to: draft.user.email,
      filingId: draft.id,
      userId: draft.userId,
      context: {
        firstName: draft.user.firstName,
        businessName: draft.businessName ?? undefined,
      },
    });
    sent++;
  }

  return { scanned: drafts.length, sent };
}

// ─── Registered-agent renewal reminders ───────────────────────────────────

const RA_BUCKETS: Array<{
  type: NotificationType;
  minDays: number;
  maxDays: number;
}> = [
  { type: 'RA_RENEWAL_60', minDays: 60, maxDays: 61 },
  { type: 'RA_RENEWAL_30', minDays: 30, maxDays: 31 },
  { type: 'RA_RENEWAL_7', minDays: 7, maxDays: 8 },
];

async function runRaRenewalReminders(now: number) {
  const horizon = new Date(now + 62 * 24 * 60 * 60 * 1000);

  const services = await prisma.registeredAgentService.findMany({
    where: {
      status: 'ACTIVE',
      renewalDate: { gte: new Date(now), lte: horizon },
      serviceProvider: 'INTERNAL',
    },
    include: { filing: { include: { user: true } } },
  });

  let sent = 0;
  for (const svc of services) {
    const days = Math.floor((svc.renewalDate.getTime() - now) / (24 * 60 * 60 * 1000));
    const bucket = RA_BUCKETS.find((b) => days >= b.minDays && days < b.maxDays);
    if (!bucket) continue;

    const alreadySent = await prisma.emailNotification.findFirst({
      where: { filingId: svc.filingId, notificationType: bucket.type },
      select: { id: true },
    });
    if (alreadySent) continue;

    await sendEmail({
      type: bucket.type,
      to: svc.filing.user.email,
      filingId: svc.filingId,
      userId: svc.filing.userId,
      context: {
        firstName: svc.filing.user.firstName,
        businessName: svc.filing.businessName ?? undefined,
      },
    });
    sent++;
  }

  return { scanned: services.length, sent };
}
