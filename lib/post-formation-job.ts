import 'server-only';

import { prisma } from '@/lib/db';
import { resolveDripLocale } from '@/lib/draft-recovery';
import { normalizeEmail } from '@/lib/email-address';
import { sendEmail, waitBetweenMarketingSends, type NotificationType } from '@/lib/email';
import { isPostFormationSeriesEnabled } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';
import { claimStatusAfterSend, MARKETING_FINAL_STATUSES, planMarketingClaim } from '@/lib/marketing-send-claim';
import { duePostFormationSteps, evaluatePostFormation, type PostFormationStepId } from '@/lib/post-formation';
import { isUniqueConflict } from '@/lib/resume-drip-claim';
import { unsubscribeLink } from '@/lib/unsubscribe';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
const DAY_MS = 24 * 60 * 60 * 1000;

const STEP_TYPE: Record<PostFormationStepId, NotificationType> = {
  DAY_3: 'POST_FORMATION_DAY_3',
  DAY_14: 'POST_FORMATION_DAY_14',
  DAY_30: 'POST_FORMATION_DAY_30',
};

export interface SeriesJobResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  disabled?: boolean;
}

async function claimStep(input: {
  filingId: string;
  step: PostFormationStepId;
  email: string;
  locale: string;
  now: Date;
}): Promise<'go' | 'skip'> {
  const existing = await prisma.postFormationSend.findUnique({
    where: { filingId_step: { filingId: input.filingId, step: input.step } },
  });
  const plan = planMarketingClaim(
    existing
      ? { status: existing.status, claimedAt: existing.claimedAt, attemptCount: existing.attemptCount }
      : null,
    input.now.getTime(),
  );
  if (plan === 'skip') return 'skip';
  if (plan === 'insert') {
    try {
      await prisma.postFormationSend.create({
        data: {
          filingId: input.filingId,
          step: input.step,
          email: input.email,
          locale: input.locale,
          status: 'PENDING',
          attemptCount: 1,
          claimedAt: input.now,
        },
      });
      return 'go';
    } catch (err) {
      if (isUniqueConflict(err)) return 'skip';
      throw err;
    }
  }
  const updated = await prisma.postFormationSend.updateMany({
    where: {
      filingId: input.filingId,
      step: input.step,
      status: existing?.status,
      claimedAt: existing?.claimedAt,
    },
    data: {
      status: 'PENDING',
      claimedAt: input.now,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
    },
  });
  return updated.count === 1 ? 'go' : 'skip';
}

export async function runPostFormationSeries(nowMs: number): Promise<SeriesJobResult> {
  if (!isPostFormationSeriesEnabled()) {
    return { scanned: 0, sent: 0, skipped: 1, failed: 0, disabled: true };
  }

  const now = new Date(nowMs);
  const filings = await prisma.filing.findMany({
    where: {
      status: 'APPROVED',
      isTest: false,
      sunbizApprovedAt: {
        gte: new Date(nowMs - (30 + 7) * DAY_MS),
        lte: new Date(nowMs - 3 * DAY_MS),
      },
      payments: { some: { status: 'SUCCEEDED', isTest: false } },
      user: {
        AND: [
          { accountStatus: { not: 'GUEST' } },
          { NOT: { email: { startsWith: 'qa+', mode: 'insensitive' } } },
          { NOT: { email: { startsWith: 'e2e+', mode: 'insensitive' } } },
          { NOT: { email: { endsWith: '@launchforma.com', mode: 'insensitive' } } },
          { NOT: { email: { endsWith: '@guest.launchforma.invalid', mode: 'insensitive' } } },
        ],
      },
    },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, locale: true, accountStatus: true },
      },
      payments: { select: { status: true, isTest: true } },
      raServices: {
        where: { serviceProvider: 'INTERNAL', status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { renewalPriceCents: true },
      },
    },
    orderBy: { sunbizApprovedAt: 'asc' },
    take: 100,
  });

  const emails = [...new Set(filings.map((filing) => normalizeEmail(filing.user.email)))];
  const optOuts = emails.length
    ? await prisma.marketingOptOut.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      })
    : [];
  const optedOut = new Set(optOuts.map((row) => normalizeEmail(row.email)));
  const suppressions = emails.length
    ? await prisma.emailSuppression.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      })
    : [];
  const suppressed = new Set(suppressions.map((row) => normalizeEmail(row.email)));
  const prior = filings.length
    ? await prisma.postFormationSend.findMany({
        where: { filingId: { in: filings.map((filing) => filing.id) }, status: 'SENT' },
        select: { filingId: true, step: true },
      })
    : [];

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let paced = false;

  for (const filing of filings) {
    const email = normalizeEmail(filing.user.email);
    const decision = evaluatePostFormation(
      {
        status: filing.status,
        isTest: filing.isTest,
        sunbizApprovedAt: filing.sunbizApprovedAt,
        accountStatus: filing.user.accountStatus,
        email,
        payments: filing.payments,
        unsubscribed: optedOut.has(email),
        sentSteps: prior.filter((row) => row.filingId === filing.id).map((row) => row.step),
      },
      now,
    );
    if (!decision.ok) {
      if (decision.reason === 'unsubscribed' && filing.sunbizApprovedAt) {
        const steps = duePostFormationSteps(
          filing.sunbizApprovedAt,
          now,
          prior.filter((row) => row.filingId === filing.id).map((row) => row.step),
        );
        if (steps.length > 0) {
          await prisma.postFormationSend.updateMany({
            where: {
              filingId: filing.id,
              step: { in: steps },
              status: { notIn: [...MARKETING_FINAL_STATUSES] },
            },
            data: { status: 'OPTED_OUT' },
          });
        }
      }
      skipped += 1;
      continue;
    }

    const locale = resolveDripLocale(filing.locale, filing.user.locale, filing.entryPath);
    for (const step of decision.steps) {
      if (suppressed.has(email)) {
        await prisma.postFormationSend.updateMany({
          where: {
            filingId: filing.id,
            step,
            status: { notIn: [...MARKETING_FINAL_STATUSES] },
          },
          data: { status: 'SUPPRESSED' },
        });
        skipped += 1;
        continue;
      }
      const claimed = await claimStep({ filingId: filing.id, step, email, locale, now });
      if (claimed === 'skip') {
        skipped += 1;
        continue;
      }
      const unsubscribeUrl = unsubscribeLink(SITE_URL, email, undefined, locale);
      try {
        if (paced) await waitBetweenMarketingSends();
        paced = true;
        const result = await sendEmail({
          type: STEP_TYPE[step],
          to: email,
          filingId: filing.id,
          userId: filing.user.id,
          step,
          listUnsubscribeUrl: unsubscribeUrl,
          context: {
            firstName: filing.user.firstName,
            businessName: filing.businessName ?? undefined,
            locale,
            unsubscribeUrl,
            linkFilingId: filing.id,
            raRenewalPriceCents: filing.raServices[0]?.renewalPriceCents ?? null,
          },
        });
        const outcome = claimStatusAfterSend({
          deliveryStatus: result.status,
          errorMessage: result.errorMessage,
        });
        await prisma.postFormationSend.update({
          where: { filingId_step: { filingId: filing.id, step } },
          data: {
            status: outcome,
            sentAt: outcome === 'SENT' ? new Date() : null,
            locale,
          },
        });
        if (outcome === 'SENT' || outcome === 'SKIPPED_TEST') sent += 1;
        else failed += 1;
      } catch (err) {
        logger.error('post-formation send failed', { area: 'cron', tag: 'post-formation', entityId: filing.id }, err);
        await prisma.postFormationSend.update({
          where: { filingId_step: { filingId: filing.id, step } },
          data: { status: 'FAILED' },
        });
        failed += 1;
      }
    }
  }

  return { scanned: filings.length, sent, skipped, failed };
}
