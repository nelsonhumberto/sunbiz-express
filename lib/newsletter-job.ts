import 'server-only';

import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email-address';
import { sendEmail, waitBetweenMarketingSends } from '@/lib/email';
import { isRecordedEmailStatus } from '@/lib/email-status';
import { isWeeklyNewsletterEnabled, resumeEmailReplyTo } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';
import {
  claimStatusAfterSend,
  MARKETING_FINAL_STATUSES,
  planMarketingClaim,
} from '@/lib/marketing-send-claim';
import {
  isEtWeekdayMorning,
  isNewsletterRecipient,
  newsletterDeliveryLocale,
  newsletterDueIssue,
  newsletterMayStart,
  type NewsletterIssueNumber,
} from '@/lib/newsletter';
import type { SeriesJobResult } from '@/lib/post-formation-job';
import { isUniqueConflict } from '@/lib/resume-drip-claim';
import { unsubscribeLink } from '@/lib/unsubscribe';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

async function claimIssue(input: {
  issueNumber: NewsletterIssueNumber;
  email: string;
  locale: string;
  now: Date;
}): Promise<'go' | 'skip'> {
  const existing = await prisma.newsletterSend.findUnique({
    where: { issueNumber_email: { issueNumber: input.issueNumber, email: input.email } },
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
      await prisma.newsletterSend.create({
        data: {
          issueNumber: input.issueNumber,
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
  const updated = await prisma.newsletterSend.updateMany({
    where: {
      issueNumber: input.issueNumber,
      email: input.email,
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

export async function runWeeklyNewsletter(nowMs: number): Promise<SeriesJobResult> {
  if (!isWeeklyNewsletterEnabled()) {
    return { scanned: 0, sent: 0, skipped: 1, failed: 0, disabled: true };
  }
  const now = new Date(nowMs);
  if (!isEtWeekdayMorning(now)) {
    return { scanned: 0, sent: 0, skipped: 1, failed: 0 };
  }

  const realCount = await prisma.checklistSignup.count({
    where: {
      confirmedAt: { not: null },
      isTest: false,
      NOT: {
        OR: [
          { email: { startsWith: 'qa+', mode: 'insensitive' } },
          { email: { startsWith: 'e2e+', mode: 'insensitive' } },
          { email: { endsWith: '@launchforma.com', mode: 'insensitive' } },
        ],
      },
    },
  });
  if (!newsletterMayStart(realCount)) {
    return { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const subscribers = await prisma.checklistSignup.findMany({
    where: {
      confirmedAt: { not: null },
      isTest: false,
      NOT: {
        OR: [
          { email: { startsWith: 'qa+', mode: 'insensitive' } },
          { email: { startsWith: 'e2e+', mode: 'insensitive' } },
          { email: { endsWith: '@launchforma.com', mode: 'insensitive' } },
        ],
      },
    },
    orderBy: { confirmedAt: 'asc' },
    take: 200,
  });

  const emails = subscribers.map((row) => normalizeEmail(row.email));
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
  const prior = emails.length
    ? await prisma.newsletterSend.findMany({
        where: { email: { in: emails } },
        select: { email: true, issueNumber: true, status: true, sentAt: true },
      })
    : [];

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let paced = false;

  for (const row of subscribers) {
    const email = normalizeEmail(row.email);
    if (optedOut.has(email)) {
      await prisma.newsletterSend.updateMany({
        where: { email, status: { notIn: [...MARKETING_FINAL_STATUSES] } },
        data: { status: 'OPTED_OUT' },
      });
      skipped += 1;
      continue;
    }
    if (
      !isNewsletterRecipient({
        email,
        confirmedAt: row.confirmedAt,
        isTest: row.isTest,
        unsubscribed: false,
      }) ||
      !row.confirmedAt
    ) {
      skipped += 1;
      continue;
    }
    const recorded = (issueNumber: NewsletterIssueNumber) =>
      prior.find(
        (item) =>
          item.email === email &&
          item.issueNumber === issueNumber &&
          isRecordedEmailStatus(item.status),
      );
    const sent001 = recorded('001');
    const sent002 = recorded('002');
    const sent003 = recorded('003');
    const sent004 = recorded('004');
    const sent005 = recorded('005');
    const issue = newsletterDueIssue({
      now,
      confirmedAt: row.confirmedAt,
      sent001: Boolean(sent001),
      sent002: Boolean(sent002),
      sent003: Boolean(sent003),
      sent004: Boolean(sent004),
      sent005: Boolean(sent005),
      sent002At: sent002?.sentAt ?? null,
      sent003At: sent003?.sentAt ?? null,
      sent004At: sent004?.sentAt ?? null,
    });
    if (!issue) {
      skipped += 1;
      continue;
    }

    const subscriberLocale = row.locale === 'es' ? 'es' : 'en';
    const locale = newsletterDeliveryLocale(issue, subscriberLocale);
    if (suppressed.has(email)) {
      await prisma.newsletterSend.updateMany({
        where: {
          email,
          issueNumber: issue,
          status: { notIn: [...MARKETING_FINAL_STATUSES] },
        },
        data: { status: 'SUPPRESSED' },
      });
      skipped += 1;
      continue;
    }
    const claimed = await claimIssue({ issueNumber: issue, email, locale, now });
    if (claimed === 'skip') {
      skipped += 1;
      continue;
    }
    const unsubscribeUrl = unsubscribeLink(SITE_URL, email, undefined, locale);
    try {
      if (paced) await waitBetweenMarketingSends();
      paced = true;
      const result = await sendEmail({
        type: 'WEEKLY_NEWSLETTER',
        to: email,
        step: issue,
        replyTo: resumeEmailReplyTo(),
        listUnsubscribeUrl: unsubscribeUrl,
        context: { locale, unsubscribeUrl, newsletterIssue: issue },
      });
      const outcome = claimStatusAfterSend({
        deliveryStatus: result.status,
        errorMessage: result.errorMessage,
      });
      await prisma.newsletterSend.update({
        where: { issueNumber_email: { issueNumber: issue, email } },
        data: {
          status: outcome,
          sentAt: outcome === 'SENT' ? new Date() : null,
          locale,
        },
      });
      if (outcome === 'SENT' || outcome === 'SKIPPED_TEST') sent += 1;
      else failed += 1;
    } catch (err) {
      logger.error('weekly newsletter send failed', { area: 'cron', tag: 'newsletter' }, err);
      await prisma.newsletterSend.update({
        where: { issueNumber_email: { issueNumber: issue, email } },
        data: { status: 'FAILED' },
      });
      failed += 1;
    }
  }

  return { scanned: subscribers.length, sent, skipped, failed };
}
