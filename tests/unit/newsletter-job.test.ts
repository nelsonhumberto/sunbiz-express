import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildNewsletterEmail } from '@/lib/newsletter-email';

const signupCount = vi.hoisted(() => vi.fn());
const signupFindMany = vi.hoisted(() => vi.fn());
const optOutFindMany = vi.hoisted(() => vi.fn());
const suppressionFindMany = vi.hoisted(() => vi.fn());
const sendFindMany = vi.hoisted(() => vi.fn());
const sendFindUnique = vi.hoisted(() => vi.fn());
const sendCreate = vi.hoisted(() => vi.fn());
const sendUpdate = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  prisma: {
    checklistSignup: { count: signupCount, findMany: signupFindMany },
    marketingOptOut: { findMany: optOutFindMany },
    emailSuppression: { findMany: suppressionFindMany },
    newsletterSend: {
      findMany: sendFindMany,
      findUnique: sendFindUnique,
      create: sendCreate,
      update: sendUpdate,
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail,
  waitBetweenMarketingSends: vi.fn(async () => undefined),
}));

import { runWeeklyNewsletter } from '@/lib/newsletter-job';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const CONFIRMED = new Date('2026-09-01T15:00:00.000Z');
const SENT_002 = new Date('2026-10-01T12:00:00.000Z');

interface SendArgs {
  to: string;
  step?: string;
  context?: { locale?: string; newsletterIssue?: string; unsubscribeUrl?: string };
}

describe('weekly newsletter locale', () => {
  const previous = process.env.WEEKLY_NEWSLETTER_ENABLED;

  afterEach(() => {
    if (previous === undefined) delete process.env.WEEKLY_NEWSLETTER_ENABLED;
    else process.env.WEEKLY_NEWSLETTER_ENABLED = previous;
    vi.clearAllMocks();
  });

  it('sends issue 003 in Spanish only when the subscriber locale is es', async () => {
    process.env.WEEKLY_NEWSLETTER_ENABLED = 'true';
    const subscribers = [
      { email: 'en@example.com', locale: 'en', confirmedAt: CONFIRMED, isTest: false },
      { email: 'es@example.com', locale: 'es', confirmedAt: CONFIRMED, isTest: false },
      { email: 'fr@example.com', locale: 'fr', confirmedAt: CONFIRMED, isTest: false },
      { email: 'blank@example.com', locale: '', confirmedAt: CONFIRMED, isTest: false },
    ];
    signupCount.mockResolvedValue(subscribers.length);
    signupFindMany.mockResolvedValue(subscribers);
    optOutFindMany.mockResolvedValue([]);
    suppressionFindMany.mockResolvedValue([]);
    sendFindMany.mockResolvedValue(
      subscribers.flatMap((row) => [
        { email: row.email, issueNumber: '001', status: 'SENT', sentAt: CONFIRMED },
        { email: row.email, issueNumber: '002', status: 'SENT', sentAt: SENT_002 },
      ]),
    );
    sendFindUnique.mockResolvedValue(null);
    sendCreate.mockResolvedValue({ id: 'claim' });
    sendUpdate.mockResolvedValue({});
    sendEmail.mockResolvedValue({ status: 'SENT' });

    const result = await runWeeklyNewsletter(NOW);

    expect(result.sent).toBe(4);
    expect(sendEmail).toHaveBeenCalledTimes(4);

    const expected = [
      { email: 'en@example.com', locale: 'en', subject: 'Get your EIN the right way' },
      { email: 'es@example.com', locale: 'es', subject: 'Obtén tu EIN de la forma correcta' },
      { email: 'fr@example.com', locale: 'en', subject: 'Get your EIN the right way' },
      { email: 'blank@example.com', locale: 'en', subject: 'Get your EIN the right way' },
    ] as const;

    for (const row of expected) {
      const args = sendEmail.mock.calls
        .map((call) => call[0] as SendArgs)
        .find((call) => call.to === row.email);
      expect(args?.step).toBe('003');
      expect(args?.context?.newsletterIssue).toBe('003');
      expect(args?.context?.locale).toBe(row.locale);
      expect(
        buildNewsletterEmail({
          issue: '003',
          locale: row.locale,
          siteUrl: 'https://launchforma.com',
          unsubscribeUrl: args?.context?.unsubscribeUrl ?? '',
        }).subject,
      ).toBe(row.subject);

      const claim = sendCreate.mock.calls
        .map((call) => call[0] as { data: { email: string; locale: string; issueNumber: string } })
        .find((call) => call.data.email === row.email);
      expect(claim?.data.issueNumber).toBe('003');
      expect(claim?.data.locale).toBe(row.locale);
    }
  });
});
