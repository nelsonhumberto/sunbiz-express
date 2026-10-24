import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { normalizeEmail } from '@/lib/email-address';
import {
  ageHoursSince,
  guestResumeUrl,
  planResumeDrip,
  raRenewalTypeForDays,
  RESUME_DRIP_STEPS,
  resolveDripLocale,
  resumeLinkPlan,
  shouldSkipDraftRecovery,
  signInResumeUrl,
  wholeDaysUntil,
  wizardPathForDraft,
} from '@/lib/draft-recovery';
import { isResumeDripEnabled, resumeEmailReplyTo } from '@/lib/feature-flags';
import { createLoginLink } from '@/lib/login-link';
import { unsubscribeLink } from '@/lib/unsubscribe';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

// Recovery + retention scheduler.
//
// Hourly so the resume sequence can send about 1 hour after a draft goes idle.
// The route is idempotent: EmailNotification is the record of which resume
// step already went to a filing, so the same step is never sent twice.
//
// What it sends:
//
//   1. Resume-order sequence (RESUME_DRIP_ENABLED, default off). About 1 hour,
//      1 day, and 3 days after Filing.updatedAt on a DRAFT that is still
//      unpaid. Replaces the old ABANDONED_24H / ABANDONED_72H / ABANDONED_7D
//      cron. When the flag is off, none of those abandoned-draft emails send.
//      The last step stamps abandonedAt.
//   2. Registered-agent renewal at 60 / 30 / 7 days. The window is one calendar
//      day wide and EmailNotification dedupes the type, so the hourly cron
//      still sends each reminder once.
//
// Annual report reminders are handled separately.

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Fail closed in production: a missing CRON_SECRET must NOT mean "open".
  // (This route sends customer emails, so an open endpoint = email bombing.)
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'cron secret not configured' }, { status: 401 });
    }
    // Local development without a secret: allow.
  } else {
    // Require the secret in the Authorization header (avoid query-string secrets
    // that leak into access logs and browser history).
    const headerSecret =
      request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (headerSecret !== CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const now = Date.now();
  const draftStats = await runDraftRecovery(now);
  const raStats = await runRaRenewalReminders(now);

  return NextResponse.json({ ok: true, drafts: draftStats, raRenewals: raStats });
}

// ─── Resume-order sequence ────────────────────────────────────────────────

async function runDraftRecovery(now: number) {
  if (!isResumeDripEnabled()) {
    return { scanned: 0, sent: 0, disabled: true };
  }

  const oldestHours = RESUME_DRIP_STEPS[RESUME_DRIP_STEPS.length - 1]!.maxHours;
  const newestHours = RESUME_DRIP_STEPS[0]!.minHours;
  const oldestCutoff = new Date(now - oldestHours * 60 * 60 * 1000);
  const newestCutoff = new Date(now - newestHours * 60 * 60 * 1000);
  const stepTypes = RESUME_DRIP_STEPS.map((step) => step.type);

  const drafts = await prisma.filing.findMany({
    where: {
      status: 'DRAFT',
      isTest: false,
      adminArchivedAt: null,
      userArchivedAt: null,
      updatedAt: { gte: oldestCutoff, lte: newestCutoff },
      payments: { none: { status: 'SUCCEEDED' } },
      user: {
        role: { not: 'ADMIN' },
        accountStatus: { not: 'DELETED' },
        AND: [
          { NOT: { email: { endsWith: '@launchforma.com', mode: 'insensitive' } } },
          { NOT: { email: { startsWith: 'qa+', mode: 'insensitive' } } },
          { NOT: { email: { startsWith: 'e2e+', mode: 'insensitive' } } },
        ],
      },
    },
    include: {
      user: true,
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
    },
  });

  let sent = 0;
  for (const draft of drafts) {
    try {
      const prior = await prisma.emailNotification.findMany({
        where: { filingId: draft.id, notificationType: { in: stepTypes } },
        select: { notificationType: true },
      });
      const optedOut = await prisma.marketingOptOut.findUnique({
        where: { email: normalizeEmail(draft.user.email) },
        select: { id: true },
      });
      const decision = planResumeDrip({
        enabled: true,
        ageHours: ageHoursSince(draft.updatedAt, now),
        sentTypes: prior.map((row) => row.notificationType),
        status: draft.status,
        paid: draft.payments.length > 0,
        unsubscribed: Boolean(optedOut),
        deleted: draft.user.accountStatus === 'DELETED',
        skip: shouldSkipDraftRecovery(draft),
      });
      if (!decision.send) continue;

      const wizardPath = wizardPathForDraft(draft.id, draft.currentStep);
      const linkKind = resumeLinkPlan(draft.user);
      const resumeUrl =
        linkKind === 'guest' && draft.user.guestToken
          ? guestResumeUrl(SITE_URL, draft.id, draft.user.guestToken)
          : linkKind === 'login-link'
            ? await createLoginLink(draft.userId, wizardPath)
            : signInResumeUrl(SITE_URL, wizardPath);
      const unsubscribeUrl = unsubscribeLink(SITE_URL, draft.user.email);

      await sendEmail({
        type: decision.send,
        to: draft.user.email,
        filingId: draft.id,
        userId: draft.userId,
        replyTo: resumeEmailReplyTo(),
        listUnsubscribeUrl: unsubscribeUrl,
        context: {
          firstName: draft.user.firstName,
          businessName: draft.businessName ?? undefined,
          resumeUrl,
          unsubscribeUrl,
          locale: resolveDripLocale(draft.locale, draft.user.locale),
        },
      });

      if (decision.final && !draft.abandonedAt) {
        await prisma.filing.update({
          where: { id: draft.id },
          data: { abandonedAt: new Date(now) },
        });
      }
      sent++;
    } catch (err) {
      console.error('[recovery] resume drip failed', draft.id, err);
    }
  }

  return { scanned: drafts.length, sent, disabled: false };
}

// ─── Registered-agent renewal reminders ───────────────────────────────────

async function runRaRenewalReminders(now: number) {
  const horizon = new Date(now + 62 * 24 * 60 * 60 * 1000);

  const services = await prisma.registeredAgentService.findMany({
    where: {
      status: 'ACTIVE',
      renewalDate: { gte: new Date(now), lte: horizon },
      serviceProvider: 'INTERNAL',
    },
    include: {
      filing: {
        include: {
          user: true,
          payments: {
            where: { status: 'SUCCEEDED' },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: { cardLast4: true },
          },
        },
      },
    },
  });

  let sent = 0;
  for (const svc of services) {
    const days = wholeDaysUntil(svc.renewalDate.getTime(), now);
    const bucket = raRenewalTypeForDays(days);
    if (!bucket) continue;

    const alreadySent = await prisma.emailNotification.findFirst({
      where: { filingId: svc.filingId, notificationType: bucket },
      select: { id: true },
    });
    if (alreadySent) continue;

    await sendEmail({
      type: bucket,
      to: svc.filing.user.email,
      filingId: svc.filingId,
      userId: svc.filing.userId,
      context: {
        firstName: svc.filing.user.firstName,
        businessName: svc.filing.businessName ?? undefined,
        raAutoRenew: svc.autoRenew,
        raRenewalPriceCents: svc.renewalPriceCents,
        raRenewalDate: svc.renewalDate,
        raCardLast4: svc.filing.payments[0]?.cardLast4 ?? undefined,
        raRenewUrl: `${SITE_URL}/dashboard/filings/${svc.filingId}/registered-agent`,
      },
    });
    sent++;
  }

  return { scanned: services.length, sent };
}
