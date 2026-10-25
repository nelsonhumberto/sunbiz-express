import 'server-only';

import { prisma } from '@/lib/db';
import { normalizeEmail } from '@/lib/email-address';
import { sendEmail } from '@/lib/email';
import { isWeeklyNewsletterEnabled } from '@/lib/feature-flags';
import { logger } from '@/lib/logger';
import { planMarketingClaim } from '@/lib/marketing-send-claim';
import {
  isEtWeekdayMorning,
  isNewsletterRecipient,
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
    existing ? { status: existing.status, claimedAt: existing.claimedAt } : null,
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
    data: { status: 'PENDING', claimedAt: input.now },
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
  const prior = emails.length
    ? await prisma.newsletterSend.findMany({
        where: { email: { in: emails } },
        select: { email: true, issueNumber: true, status: true },
      })
    : [];

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of subscribers) {
    const email = normalizeEmail(row.email);
    if (
      !isNewsletterRecipient({
        email,
        confirmedAt: row.confirmedAt,
        isTest: row.isTest,
        unsubscribed: optedOut.has(email),
      }) ||
      !row.confirmedAt
    ) {
      skipped += 1;
      continue;
    }
    const sent001 = prior.some(
      (item) => item.email === email && item.issueNumber === '001' && item.status === 'SENT',
    );
    const sent002 = prior.some(
      (item) => item.email === email && item.issueNumber === '002' && item.status === 'SENT',
    );
    const issue = newsletterDueIssue({
      now,
      confirmedAt: row.confirmedAt,
      sent001,
      sent002,
    });
    if (!issue) {
      skipped += 1;
      continue;
    }

    const locale = row.locale === 'en' ? 'en' : 'es';
    const claimed = await claimIssue({ issueNumber: issue, email, locale, now });
    if (claimed === 'skip') {
      skipped += 1;
      continue;
    }
    const unsubscribeUrl = unsubscribeLink(SITE_URL, email);
    try {
      const result = await sendEmail({
        type: 'WEEKLY_NEWSLETTER',
        to: email,
        step: issue,
        listUnsubscribeUrl: unsubscribeUrl,
        context: { locale, unsubscribeUrl, newsletterIssue: issue },
      });
      if (result.status === 'SENT') {
        await prisma.newsletterSend.update({
          where: { issueNumber_email: { issueNumber: issue, email } },
          data: { status: 'SENT', sentAt: new Date(), locale },
        });
        sent += 1;
      } else {
        await prisma.newsletterSend.update({
          where: { issueNumber_email: { issueNumber: issue, email } },
          data: { status: 'FAILED' },
        });
        failed += 1;
      }
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
