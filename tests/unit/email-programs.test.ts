import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checklistCopy } from '@/lib/drip-copy';
import { buildChecklistConfirmEmail, buildChecklistEmail } from '@/lib/drip-email';
import {
  checklistConfirmPlan,
  checklistConfirmUrl,
  countsAsRealSubscriber,
  hashChecklistToken,
  isChecklistTestAddress,
  isSignupHoneypot,
  readChecklistConfirmToken,
  signChecklistConfirmToken,
} from '@/lib/checklist-opt-in';
import { renderTemplate } from '@/lib/email';
import {
  isPostFormationSeriesEnabled,
  isSignupCaptureEnabled,
  isWeeklyNewsletterEnabled,
} from '@/lib/feature-flags';
import {
  newsletterSendKey,
  claimStatusAfterSend,
  planMarketingClaim,
  postFormationSendKey,
} from '@/lib/marketing-send-claim';
import {
  addEtDays,
  allNewsletterCopyText,
  firstWeekdayMorningEt,
  isEtWeekdayMorning,
  isNewsletterRecipient,
  newsletterDeliveryLocale,
  newsletterDueIssue,
  newsletterIssueCopy,
  newsletterIssueSchedule,
  newsletterMayStart,
  STORED_NEWSLETTER_ISSUES,
} from '@/lib/newsletter';
import { buildNewsletterEmail } from '@/lib/newsletter-email';
import { duePostFormationSteps, evaluatePostFormation, type PostFormationCandidate } from '@/lib/post-formation';
import {
  allPostFormationCopyText,
  buildPostFormationEmail,
  certificateCtaUrl,
  LOCALE_PRESERVING_CERTIFICATE_LINKS,
} from '@/lib/post-formation-email';
import {
  readUnsubscribeToken,
  signUnsubscribeToken,
  unsubscribeLink,
  unsubscribeSigningSecret,
  UNSUBSCRIBE_LEGACY_UNTIL_MS,
  UNSUBSCRIBE_TOKEN_TTL_MS,
} from '@/lib/unsubscribe';

const SECRET = 'test-unsubscribe-secret';
const SITE = 'https://launchforma.com';

function ready(overrides: Partial<PostFormationCandidate> = {}): PostFormationCandidate {
  return {
    status: 'APPROVED',
    isTest: false,
    sunbizApprovedAt: new Date('2026-10-01T15:00:00.000Z'),
    accountStatus: 'ACTIVE',
    email: 'ada@example.com',
    payments: [{ status: 'SUCCEEDED', isTest: false }],
    unsubscribed: false,
    sentSteps: [],
    ...overrides,
  };
}

describe('checklist confirm token', () => {
  const now = Date.parse('2026-10-25T15:00:00.000Z');

  it('round-trips a signed expiring token and rejects tampering, expiry, and unsubscribe tokens', () => {
    const expires = now + 48 * 60 * 60 * 1000;
    const token = signChecklistConfirmToken('QA+Ada@Example.com', expires, SECRET);
    expect(readChecklistConfirmToken(token, now, SECRET)).toEqual({
      ok: true,
      email: 'qa+ada@example.com',
      expiresAtMs: expires,
    });
    expect(readChecklistConfirmToken(token, expires, SECRET).ok).toBe(false);
    expect(readChecklistConfirmToken(`${token}x`, now, SECRET)).toEqual({ ok: false, reason: 'invalid' });
    expect(readChecklistConfirmToken(token, now, 'other-secret')).toEqual({ ok: false, reason: 'invalid' });
    const unsub = signUnsubscribeToken('ada@example.com', SECRET);
    expect(readChecklistConfirmToken(unsub, now, SECRET)).toEqual({ ok: false, reason: 'invalid' });
    expect(readUnsubscribeToken(token, SECRET)).toBeNull();
    expect(checklistConfirmUrl(token, `${SITE}/`)).toBe(
      `${SITE}/api/checklist/confirm?token=${encodeURIComponent(token)}`,
    );
    expect(hashChecklistToken(token)).toHaveLength(64);
  });

  it('plans delivery once, then treats a repeat click as already sent', () => {
    expect(
      checklistConfirmPlan({
        tokenStatus: 'valid',
        hashMatches: true,
        unsubscribedAfterConsent: false,
        checklistSent: false,
      }),
    ).toBe('deliver');
    expect(
      checklistConfirmPlan({
        tokenStatus: 'expired',
        hashMatches: true,
        unsubscribedAfterConsent: false,
        checklistSent: true,
      }),
    ).toBe('already');
    expect(
      checklistConfirmPlan({
        tokenStatus: 'expired',
        hashMatches: true,
        unsubscribedAfterConsent: false,
        checklistSent: false,
      }),
    ).toBe('expired');
    expect(
      checklistConfirmPlan({
        tokenStatus: 'valid',
        hashMatches: true,
        unsubscribedAfterConsent: true,
        checklistSent: false,
      }),
    ).toBe('unsubscribed');
    expect(
      checklistConfirmPlan({
        tokenStatus: 'invalid',
        hashMatches: true,
        unsubscribedAfterConsent: false,
        checklistSent: false,
      }),
    ).toBe('invalid');
  });

  it('keeps the honeypot, the unchecked box, and test addresses out of the subscriber count', () => {
    expect(isSignupHoneypot('http://spam.test')).toBe(true);
    expect(isSignupHoneypot('  ')).toBe(false);
    expect(isSignupHoneypot(undefined)).toBe(false);
    expect(isChecklistTestAddress('QA+buyer@gmail.com')).toBe(true);
    expect(isChecklistTestAddress('e2e+flow@example.com')).toBe(true);
    expect(isChecklistTestAddress('Ada@LaunchForma.com')).toBe(true);
    expect(isChecklistTestAddress('user+qa+@example.com')).toBe(false);
    expect(isChecklistTestAddress('ada@launchforma.com.evil')).toBe(false);
    expect(isChecklistTestAddress('ada@example.com')).toBe(false);
    const confirmed = new Date('2026-10-25T12:00:00.000Z');
    expect(
      countsAsRealSubscriber({
        email: 'ada@example.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(true);
    expect(
      countsAsRealSubscriber({
        email: 'qa+ada@example.com',
        confirmedAt: confirmed,
        isTest: true,
        unsubscribed: false,
      }),
    ).toBe(false);
    expect(
      countsAsRealSubscriber({
        email: 'ada@launchforma.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(false);
    expect(
      countsAsRealSubscriber({
        email: 'ada@example.com',
        confirmedAt: null,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(false);
    expect(
      countsAsRealSubscriber({
        email: 'ada@example.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: true,
      }),
    ).toBe(false);
  });
});

describe('unsubscribe', () => {
  it('shows a confirm page on GET and unsubscribes only on POST, including one-click', () => {
    const route = readFileSync('app/unsubscribe/route.ts', 'utf8');
    const getStart = route.indexOf('export async function GET');
    const postStart = route.indexOf('export async function POST');
    const getBody = route.slice(getStart, postStart);
    expect(getBody).not.toContain('recordOptOut');
    expect(getBody).toContain('confirmPage');
    expect(route).toContain('method="post"');
    expect(route.slice(postStart)).toContain('recordOptOut');
    expect(route.slice(postStart)).toContain('List-Unsubscribe');
    expect(route).toContain('prisma.marketingOptOut.upsert');
    expect(route).toContain("update: { source: 'unsubscribe' }");
    expect(route).not.toContain('update: {}');
    const link = unsubscribeLink(SITE, 'Ada@Example.com', SECRET, 'es');
    expect(link).toContain('locale=es');
    const token = new URL(link).searchParams.get('token') ?? '';
    expect(readUnsubscribeToken(token, SECRET)).toBe('ada@example.com');
  });

  it('expires new tokens after a year and keeps older links until the legacy cutoff', () => {
    const issued = Date.parse('2026-01-01T00:00:00.000Z');
    const token = signUnsubscribeToken('Ada@Example.com', SECRET, issued);
    expect(readUnsubscribeToken(token, SECRET, issued + UNSUBSCRIBE_TOKEN_TTL_MS)).toBe('ada@example.com');
    expect(readUnsubscribeToken(token, SECRET, issued + UNSUBSCRIBE_TOKEN_TTL_MS + 1)).toBeNull();

    const payload = Buffer.from('ada@example.com', 'utf8').toString('base64url');
    const sig = createHmac('sha256', SECRET).update('lf-unsub-v1:ada@example.com').digest('base64url');
    const legacy = `${payload}.${sig}`;
    expect(readUnsubscribeToken(legacy, SECRET, Date.parse('2027-01-01T00:00:00.000Z'))).toBe('ada@example.com');
    expect(readUnsubscribeToken(legacy, SECRET, UNSUBSCRIBE_LEGACY_UNTIL_MS)).toBeNull();

    expect(() => unsubscribeSigningSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /UNSUBSCRIBE_SECRET/,
    );
    expect(
      unsubscribeSigningSecret({ NODE_ENV: 'production', NEXTAUTH_SECRET: 'prod-secret' } as NodeJS.ProcessEnv),
    ).toBe('prod-secret');
  });

  it('puts a signed unsubscribe link in the checklist, series, and newsletter', () => {
    const unsub = `${SITE}/unsubscribe?token=abc`;
    const confirm = buildChecklistConfirmEmail({
      locale: 'en',
      firstName: 'Ana',
      confirmUrl: `${SITE}/api/checklist/confirm?token=t`,
      unsubscribeUrl: unsub,
    });
    const delivery = buildChecklistEmail({
      locale: 'es',
      firstName: 'Ana',
      siteUrl: SITE,
      unsubscribeUrl: unsub,
    });
    const series = buildPostFormationEmail({
      step: 'DAY_30',
      locale: 'en',
      firstName: 'Ana',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: unsub,
    });
    const weekly = buildNewsletterEmail({
      issue: '001',
      locale: 'en',
      siteUrl: SITE,
      unsubscribeUrl: unsub,
    });
    for (const body of [confirm.inner, delivery.inner, series.inner, weekly.inner]) {
      expect(body).toContain(unsub);
      expect(body).toMatch(/Unsubscribe|Cancelar suscripción/);
    }
  });
});

describe('post-formation eligibility', () => {
  const due = new Date('2026-10-04T15:00:00.000Z');

  it('requires a real paid approval and skips tests, guests, and opt-outs', () => {
    expect(evaluatePostFormation(ready(), due)).toEqual({ ok: true, steps: ['DAY_3'] });
    expect(evaluatePostFormation(ready({ isTest: true }), due)).toEqual({
      ok: false,
      reason: 'filing-test',
    });
    expect(evaluatePostFormation(ready({ payments: [] }), due)).toEqual({ ok: false, reason: 'unpaid' });
    expect(
      evaluatePostFormation(ready({ payments: [{ status: 'SUCCEEDED', isTest: true }] }), due),
    ).toEqual({ ok: false, reason: 'unpaid' });
    expect(
      evaluatePostFormation(ready({ payments: [{ status: 'PENDING', isTest: false }] }), due),
    ).toEqual({ ok: false, reason: 'unpaid' });
    expect(evaluatePostFormation(ready({ accountStatus: 'GUEST' }), due)).toEqual({
      ok: false,
      reason: 'guest',
    });
    expect(evaluatePostFormation(ready({ email: 'qa+buyer@gmail.com' }), due)).toEqual({
      ok: false,
      reason: 'test-address',
    });
    expect(evaluatePostFormation(ready({ email: 'E2E+flow@example.com' }), due)).toEqual({
      ok: false,
      reason: 'test-address',
    });
    expect(evaluatePostFormation(ready({ email: 'ops@launchforma.com' }), due)).toEqual({
      ok: false,
      reason: 'test-address',
    });
    expect(
      evaluatePostFormation(ready({ email: 'guest.abc@guest.launchforma.invalid' }), due),
    ).toEqual({ ok: false, reason: 'test-address' });
    expect(evaluatePostFormation(ready({ unsubscribed: true }), due)).toEqual({
      ok: false,
      reason: 'unsubscribed',
    });
    expect(evaluatePostFormation(ready({ status: 'SUBMITTED' }), due)).toEqual({
      ok: false,
      reason: 'not-approved',
    });
    expect(evaluatePostFormation(ready({ sunbizApprovedAt: null }), due)).toEqual({
      ok: false,
      reason: 'no-approval-time',
    });
  });

  it('sends each step once, inside a week of day 3, 14, and 30', () => {
    const approved = new Date('2026-10-01T15:00:00.000Z');
    const almost = new Date(approved.getTime() + 3 * 24 * 60 * 60 * 1000 - 1);
    const day3 = new Date(approved.getTime() + 3 * 24 * 60 * 60 * 1000);
    const day10 = new Date(approved.getTime() + 10 * 24 * 60 * 60 * 1000);
    const day14 = new Date(approved.getTime() + 14 * 24 * 60 * 60 * 1000);
    const day30 = new Date(approved.getTime() + 30 * 24 * 60 * 60 * 1000);
    expect(duePostFormationSteps(approved, almost, [])).toEqual([]);
    expect(duePostFormationSteps(approved, day3, [])).toEqual(['DAY_3']);
    expect(duePostFormationSteps(approved, day3, ['DAY_3'])).toEqual([]);
    expect(duePostFormationSteps(approved, day10, [])).toEqual([]);
    expect(duePostFormationSteps(approved, day14, [])).toEqual(['DAY_14']);
    expect(duePostFormationSteps(approved, day30, ['DAY_14'])).toEqual(['DAY_30']);
  });
});

describe('marketing send idempotency', () => {
  const now = Date.parse('2026-10-25T15:00:00.000Z');
  const fresh = new Date(now - 60 * 1000);
  const stale = new Date(now - 16 * 60 * 1000);

  it('inserts once, skips a sent or fresh claim, and reclaims a failure', () => {
    expect(planMarketingClaim(null, now)).toBe('insert');
    expect(planMarketingClaim({ status: 'SENT', claimedAt: fresh }, now)).toBe('skip');
    expect(planMarketingClaim({ status: 'SKIPPED_TEST', claimedAt: fresh }, now)).toBe('skip');
    expect(planMarketingClaim({ status: 'PENDING', claimedAt: fresh }, now)).toBe('skip');
    expect(planMarketingClaim({ status: 'PENDING', claimedAt: stale }, now)).toBe('reclaim');
    expect(planMarketingClaim({ status: 'FAILED', claimedAt: fresh, attemptCount: 2 }, now)).toBe('reclaim');
    expect(planMarketingClaim({ status: 'FAILED', claimedAt: fresh, attemptCount: 3 }, now)).toBe('skip');
    expect(planMarketingClaim({ status: 'SUPPRESSED', claimedAt: fresh, attemptCount: 1 }, now)).toBe('skip');
    expect(planMarketingClaim({ status: 'OPTED_OUT', claimedAt: fresh }, now)).toBe('skip');
    expect(planMarketingClaim({ status: 'PENDING', claimedAt: stale, attemptCount: 3 }, now)).toBe('skip');
    expect(claimStatusAfterSend({ deliveryStatus: 'SENT' })).toBe('SENT');
    expect(
      claimStatusAfterSend({
        deliveryStatus: 'FAILED',
        errorMessage: 'Recipient is on the suppression list.',
      }),
    ).toBe('SUPPRESSED');
    expect(postFormationSendKey('fil_1', 'DAY_3')).toBe('fil_1:DAY_3');
    expect(newsletterSendKey('Ada@Example.com', '001')).toBe('ada@example.com:001');
    expect(newsletterSendKey('Ada@Example.com', '002')).not.toBe(newsletterSendKey('ada@example.com', '001'));
    expect(newsletterSendKey('Ada@Example.com', '003')).toBe('ada@example.com:003');
    expect(newsletterSendKey('Ada@Example.com', '004')).toBe('ada@example.com:004');
    expect(newsletterSendKey('Ada@Example.com', '005')).toBe('ada@example.com:005');
    expect(newsletterSendKey('Ada@Example.com', '003')).not.toBe(newsletterSendKey('ada@example.com', '004'));
    expect(newsletterSendKey('Ada@Example.com', '004')).not.toBe(newsletterSendKey('ada@example.com', '005'));
  });
});

describe('newsletter schedule', () => {
  it('uses the first weekday morning ET, then the same clock time a week later', () => {
    const afterTuesdayMorning = new Date('2026-10-27T15:00:00.000Z');
    const earlyTuesday = new Date('2026-10-27T10:00:00.000Z');
    const saturday = new Date('2026-10-31T15:00:00.000Z');
    expect(firstWeekdayMorningEt(afterTuesdayMorning).toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(firstWeekdayMorningEt(earlyTuesday).toISOString()).toBe('2026-10-27T12:00:00.000Z');
    expect(firstWeekdayMorningEt(saturday).toISOString()).toBe('2026-11-02T13:00:00.000Z');

    const schedule = newsletterIssueSchedule(earlyTuesday);
    expect(schedule.issue001.toISOString()).toBe('2026-10-27T12:00:00.000Z');
    expect(schedule.issue002.toISOString()).toBe('2026-11-03T13:00:00.000Z');
    expect(schedule.issue003.toISOString()).toBe('2026-11-10T13:00:00.000Z');
    expect(schedule.issue004.toISOString()).toBe('2026-11-17T13:00:00.000Z');
    expect(schedule.issue005.toISOString()).toBe('2026-11-24T13:00:00.000Z');
    expect(addEtDays(schedule.issue001, 7).toISOString()).toBe(schedule.issue002.toISOString());
    expect(addEtDays(schedule.issue002, 7).toISOString()).toBe(schedule.issue003.toISOString());
    expect(addEtDays(schedule.issue003, 7).toISOString()).toBe(schedule.issue004.toISOString());
    expect(addEtDays(schedule.issue004, 7).toISOString()).toBe(schedule.issue005.toISOString());

    expect(isEtWeekdayMorning(new Date('2026-10-27T13:00:00.000Z'))).toBe(true);
    expect(isEtWeekdayMorning(new Date('2026-11-02T13:00:00.000Z'))).toBe(true);
    expect(isEtWeekdayMorning(new Date('2026-10-27T17:00:00.000Z'))).toBe(false);
    expect(isEtWeekdayMorning(new Date('2026-10-27T22:00:00.000Z'))).toBe(false);
    expect(isEtWeekdayMorning(new Date('2026-10-28T02:00:00.000Z'))).toBe(false);
    expect(isEtWeekdayMorning(new Date('2026-10-25T13:00:00.000Z'))).toBe(false);
  });

  it('sends 001 before 002, including for someone who confirms later', () => {
    const confirmed = new Date('2026-10-27T10:00:00.000Z');
    const morning = new Date('2026-10-27T13:00:00.000Z');
    const nextWeek = new Date('2026-11-03T13:00:00.000Z');
    expect(
      newsletterDueIssue({ now: morning, confirmedAt: confirmed, sent001: false, sent002: false }),
    ).toBe('001');
    expect(
      newsletterDueIssue({ now: nextWeek, confirmedAt: confirmed, sent001: false, sent002: false }),
    ).toBe('001');
    expect(
      newsletterDueIssue({ now: nextWeek, confirmedAt: confirmed, sent001: true, sent002: false }),
    ).toBe('002');
    expect(
      newsletterDueIssue({ now: nextWeek, confirmedAt: confirmed, sent001: true, sent002: true }),
    ).toBeNull();
    const later = new Date('2026-11-04T15:00:00.000Z');
    const laterMorning = firstWeekdayMorningEt(later);
    expect(
      newsletterDueIssue({
        now: new Date(laterMorning.getTime() + 60 * 60 * 1000),
        confirmedAt: later,
        sent001: false,
        sent002: false,
      }),
    ).toBe('001');
    expect(newsletterMayStart(0)).toBe(false);
    expect(newsletterMayStart(1)).toBe(true);
    expect(
      isNewsletterRecipient({
        email: 'qa+ada@example.com',
        confirmedAt: confirmed,
        isTest: true,
        unsubscribed: false,
      }),
    ).toBe(false);
    expect(
      isNewsletterRecipient({
        email: 'ada@example.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(true);
    expect(
      isNewsletterRecipient({
        email: 'ada@example.com',
        confirmedAt: null,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(false);
    expect(
      isNewsletterRecipient({
        email: 'ada@example.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: true,
      }),
    ).toBe(false);
    expect(
      isNewsletterRecipient({
        email: 'e2e+ada@example.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(false);
    expect(
      isNewsletterRecipient({
        email: 'ops@launchforma.com',
        confirmedAt: confirmed,
        isTest: false,
        unsubscribed: false,
      }),
    ).toBe(false);
  });

  it('sends 003 seven days after that subscriber 002, then 004 seven days after 003', () => {
    const confirmed = new Date('2026-10-27T10:00:00.000Z');
    const schedule = newsletterIssueSchedule(confirmed);
    const morning003 = new Date(schedule.issue003.getTime() + 60 * 60 * 1000);
    const dayBefore003 = addEtDays(schedule.issue003, -1);
    const base = {
      confirmedAt: confirmed,
      sent001: true,
      sent002: true,
      sent002At: schedule.issue002,
      sent003: false,
      sent004: false,
    };
    expect(newsletterDueIssue({ ...base, now: dayBefore003 })).toBeNull();
    expect(newsletterDueIssue({ ...base, now: morning003 })).toBe('003');
    expect(
      newsletterDueIssue({
        ...base,
        now: new Date(schedule.issue004.getTime() + 60 * 60 * 1000),
      }),
    ).toBe('003');
    const morning004 = new Date(schedule.issue004.getTime() + 60 * 60 * 1000);
    expect(
      newsletterDueIssue({
        ...base,
        now: addEtDays(schedule.issue004, -1),
        sent003: true,
        sent003At: schedule.issue003,
      }),
    ).toBeNull();
    expect(
      newsletterDueIssue({
        ...base,
        now: morning004,
        sent003: true,
        sent003At: schedule.issue003,
      }),
    ).toBe('004');
    expect(
      newsletterDueIssue({
        ...base,
        now: morning004,
        sent003: true,
        sent004: true,
        sent003At: schedule.issue003,
      }),
    ).toBeNull();
  });

  it('does not burst 003 and 004 on deploy for someone already past 002', () => {
    const confirmed = new Date('2026-09-01T15:00:00.000Z');
    const schedule = newsletterIssueSchedule(confirmed);
    const deployMorning = new Date('2026-10-28T12:00:00.000Z');
    expect(isEtWeekdayMorning(deployMorning)).toBe(true);
    expect(deployMorning.getTime()).toBeGreaterThan(schedule.issue004.getTime());

    const caughtUp = {
      now: deployMorning,
      confirmedAt: confirmed,
      sent001: true,
      sent002: true,
      sent003: false,
      sent004: false,
      sent002At: schedule.issue002,
    };
    expect(newsletterDueIssue(caughtUp)).toBe('003');
    expect(newsletterDueIssue({ ...caughtUp, sent002At: addEtDays(deployMorning, -1) })).toBeNull();
    expect(newsletterDueIssue({ ...caughtUp, sent002At: null })).toBeNull();

    const nextMorning = addEtDays(deployMorning, 1);
    expect(
      newsletterDueIssue({
        ...caughtUp,
        now: nextMorning,
        sent003: true,
        sent003At: deployMorning,
      }),
    ).toBeNull();
    expect(
      newsletterDueIssue({
        ...caughtUp,
        now: addEtDays(deployMorning, 6),
        sent003: true,
        sent003At: deployMorning,
      }),
    ).toBeNull();
    expect(
      newsletterDueIssue({
        ...caughtUp,
        now: addEtDays(deployMorning, 7),
        sent003: true,
        sent003At: deployMorning,
      }),
    ).toBe('004');

    const sent004At = addEtDays(deployMorning, 7);
    expect(
      newsletterDueIssue({
        ...caughtUp,
        now: sent004At,
        sent003: true,
        sent004: true,
        sent003At: deployMorning,
        sent004At,
      }),
    ).toBeNull();
    expect(
      newsletterDueIssue({
        ...caughtUp,
        now: addEtDays(deployMorning, 14),
        sent003: true,
        sent004: true,
        sent003At: deployMorning,
        sent004At,
      }),
    ).toBe('005');
  });

  it('sends 005 seven days after that subscriber 004, and not before 004', () => {
    const confirmed = new Date('2026-10-27T10:00:00.000Z');
    const schedule = newsletterIssueSchedule(confirmed);
    const morning005 = new Date(schedule.issue005.getTime() + 60 * 60 * 1000);
    const base = {
      confirmedAt: confirmed,
      sent001: true,
      sent002: true,
      sent003: true,
      sent004: false,
      sent005: false,
      sent002At: schedule.issue002,
      sent003At: schedule.issue003,
    };
    expect(newsletterDueIssue({ ...base, now: morning005 })).toBe('004');
    expect(
      newsletterDueIssue({
        ...base,
        now: morning005,
        sent004: true,
        sent004At: addEtDays(schedule.issue005, -1),
      }),
    ).toBeNull();
    expect(
      newsletterDueIssue({
        ...base,
        now: morning005,
        sent004: true,
        sent004At: schedule.issue004,
      }),
    ).toBe('005');
    expect(
      newsletterDueIssue({
        ...base,
        now: morning005,
        sent004: true,
        sent005: true,
        sent004At: schedule.issue004,
      }),
    ).toBeNull();
    expect(
      newsletterDueIssue({
        ...base,
        now: addEtDays(morning005, -1),
        sent004: true,
        sent004At: new Date('2026-09-01T12:00:00.000Z'),
      }),
    ).toBe('005');
  });
});

describe('approved copy', () => {
  it('keeps the signup box, the checklist, and the series free of em dashes and extra prices', () => {
    const off = {} as NodeJS.ProcessEnv;
    expect(isSignupCaptureEnabled(off)).toBe(false);
    expect(isPostFormationSeriesEnabled(off)).toBe(false);
    expect(isWeeklyNewsletterEnabled(off)).toBe(false);
    expect(LOCALE_PRESERVING_CERTIFICATE_LINKS).toBe(true);

    const english = checklistCopy('en');
    expect(english.headline).toBe('Get the free "Starting your LLC" checklist');
    expect(english.button).toBe('Send me the checklist');
    expect(english.pageTitle).toBe('Starting Your LLC: A One-Page Checklist');
    expect(english.sections[0]?.items[0]).toContain('Pick your state of formation');
    expect(english.closerCta).toBe('Start your LLC at LaunchForma');
    expect(english.thanksTitle).toBe('Almost done!');
    expect(english.thanksBody).toBe(
      "Check your inbox and click the link to confirm, then we'll send your checklist.",
    );
    expect(checklistCopy('es').thanksTitle).toBe('¡Ya casi!');
    expect(checklistCopy('es').thanksBody).toBe(
      'Revisa tu correo y toca el enlace para confirmar; luego te enviamos la lista.',
    );
    expect(newsletterIssueCopy('001', 'es').intro).toContain('Te damos la bienvenida');
    expect(newsletterIssueCopy('001', 'es').intro).toContain('Dos cosas rápidas y sigues con tu negocio');
    expect(newsletterIssueCopy('001', 'es').intro).not.toContain('Bienvenido');
    expect(newsletterIssueCopy('002', 'es').intro).toContain('sigues con tu negocio');
    expect(readFileSync('app/(marketing)/checklist/page.tsx', 'utf8')).toContain('NEXT_PUBLIC_SITE_URL');
    expect(readFileSync('lib/checklist-lead.ts', 'utf8')).toContain('checklistSentAt: null');
    expect(readFileSync('lib/email.ts', 'utf8')).toContain('sharedSmtpTransport');
    expect(readFileSync('lib/newsletter-job.ts', 'utf8')).toContain('waitBetweenMarketingSends');
    expect(readFileSync('app/api/cron/recovery/route.ts', 'utf8')).toContain('seriesErrors');
    expect(checklistCopy('es').pageTitle.length).toBeGreaterThan(0);
    expect(checklistCopy('es').sections).toHaveLength(4);

    const day3 = buildPostFormationEmail({
      step: 'DAY_3',
      locale: 'en',
      firstName: 'Ana',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(day3.subject).toBe('A quick tip for opening your business bank account');
    expect(day3.inner).toContain(
      '/oa/00b55f865c09bd021c4d3248a27f39ef/launchforma-florida-llc-operating-agreement-sample-single-member.pdf',
    );
    expect(day3.inner).toContain(
      '/oa/00b55f865c09bd021c4d3248a27f39ef/launchforma-florida-llc-operating-agreement-sample-multi-member.pdf',
    );
    expect(day3.inner).toContain(`${SITE}/dashboard/filings/fil_1/certificates/cert_status`);
    expect(day3.inner).toContain('Already included');
    expect(day3.inner).toContain('not a law firm or government agency');
    expect(day3.inner).not.toMatch(/\$39|\$59|\$84|\$150/);

    const day3es = buildPostFormationEmail({
      step: 'DAY_3',
      locale: 'es',
      firstName: 'Ana',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(day3es.inner).toContain(`${SITE}/es/dashboard/filings/fil_1/certificates/cert_status`);
    expect(day3es.inner).toContain(`${SITE}/es/dashboard/filings/fil_1/certificates/cert_copy`);
    expect(day3es.inner).toContain('launchforma-acuerdo-operativo-llc-florida-muestra-un-miembro.pdf');
    expect(certificateCtaUrl('es', 'fil_1', 'cert_status', SITE)).toBe(
      `${SITE}/es/dashboard/filings/fil_1/certificates/cert_status`,
    );

    const day14 = buildPostFormationEmail({
      step: 'DAY_14',
      locale: 'en',
      firstName: 'Ana',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(day14.inner).toContain('$400');
    expect(day14.inner).toContain(`${SITE}/file-annual-report`);
    expect(day14.inner).not.toContain('/oa/');

    const day14es = buildPostFormationEmail({
      step: 'DAY_14',
      locale: 'es',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(day14es.inner).toContain(`${SITE}/es/file-annual-report`);

    const day30 = buildPostFormationEmail({
      step: 'DAY_30',
      locale: 'en',
      firstName: 'Ana',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(day30.inner).toContain('$150');
    expect(day30.inner).toContain(`${SITE}/sign-in`);
    expect(day30.inner).toContain(`${SITE}/guides/florida-registered-agent`);
    expect(day30.inner).not.toContain('/oa/');
    expect(day30.inner).not.toContain('$400');

    const day30es = buildPostFormationEmail({
      step: 'DAY_30',
      locale: 'es',
      businessName: 'Northwind LLC',
      filingId: 'fil_1',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(day30es.inner).toContain(`${SITE}/es/sign-in`);
    expect(day30es.inner).toContain(`${SITE}/es/guides/florida-registered-agent`);

    const issue1 = buildNewsletterEmail({
      issue: '001',
      locale: 'en',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(issue1.subject).toBe(newsletterIssueCopy('001', 'en').subject);
    expect(issue1.inner).toContain('June 1');
    expect(issue1.inner).not.toContain('$300');
    expect(issue1.inner).not.toContain('$400');
    expect(issue1.inner).not.toContain('/oa/');
    const issue2 = buildNewsletterEmail({
      issue: '002',
      locale: 'en',
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
    });
    expect(issue2.inner).toContain('$400');
    expect(issue2.inner).toContain('third Friday in September');
    expect(issue2.inner).not.toContain('/oa/');

    const unsub = `${SITE}/unsubscribe?token=abc`;
    const issue3 = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '003',
      locale: 'en',
      unsubscribeUrl: unsub,
    });
    expect(issue3.subject).toBe('Get your EIN the right way');
    expect(issue3.html).toContain('Your EIN is issued by the IRS.');
    expect(issue3.html).toContain('January 15, 2027');
    expect(issue3.html).toContain(unsub);
    expect(issue3.html).toContain('Unsubscribe');
    expect(issue3.html).toContain('Miami Lakes, FL 33016');
    expect(issue3.html).toContain(`${SITE}`);
    expect(issue3.html).not.toContain('/launch-bundle');
    expect(issue3.html).not.toMatch(/\bfree\b/i);
    expect(issue3.html).not.toMatch(/\$\d/);

    const issue3es = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '003',
      locale: 'es',
      unsubscribeUrl: unsub,
    });
    expect(issue3es.subject).toBe('Obtén tu EIN de la forma correcta');
    expect(issue3es.html).toContain('Hola,');
    expect(issue3es.html).toContain('lang="es"');
    expect(issue3es.html).toContain('El EIN lo emite el IRS.');
    expect(issue3es.html).toContain('15 de enero de 2027');
    expect(issue3es.html).toContain('Cancelar suscripción');
    expect(issue3es.html).toContain('Preferencias de correo');
    expect(issue3es.html).toContain('Forma tu empresa con claridad');
    expect(issue3es.html).toContain('LaunchForma no ofrece asesoría legal');
    expect(issue3es.html).not.toMatch(/despacho|bufete/i);
    expect(issue3es.html).toContain('14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016');
    expect(issue3es.html).toContain(`${SITE}/es"`);
    expect(issue3es.html).toContain(
      'https://www.irs.gov/es/businesses/small-businesses-self-employed/get-an-employer-identification-number',
    );
    expect(issue3es.html).toContain('https://www.irs.gov/es/faqs/estimated-tax');
    expect(issue3es.html).toContain(unsub);
    expect(issue3es.html).not.toContain('Hi there,');
    expect(issue3es.html).not.toContain('January 15, 2027');
    expect(issue3es.html).not.toContain('/launch-bundle');
    expect(issue3es.html).not.toMatch(/\$\d/);
    expect(issue3es.html).not.toMatch(/\bgratis\b/i);
    expect(newsletterDeliveryLocale('003', 'es')).toBe('es');
    expect(newsletterDeliveryLocale('003', 'en')).toBe('en');
    expect(newsletterDeliveryLocale('001', 'es')).toBe('es');
    expect(newsletterIssueCopy('003', 'es').intro).toBe(
      'Aquí van dos cosas rápidas de esta semana, y luego puedes volver a construir tu negocio.',
    );
    const issue3other = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '003',
      locale: 'fr',
      unsubscribeUrl: unsub,
    });
    expect(issue3other.subject).toBe(issue3.subject);
    expect(issue3other.html).toContain('lang="en"');

    const issue4 = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '004',
      locale: 'en',
      unsubscribeUrl: unsub,
    });
    expect(issue4.subject).toBe('Keep your business money in its own lane');
    expect(issue4.html).toContain('February 1, 2027');
    expect(issue4.html).toContain('January 31 falls on a Sunday');
    expect(issue4.html).toContain(`${SITE}/checklist`);
    expect(issue4.html).toContain(unsub);
    expect(issue4.html).toContain('Unsubscribe');
    expect(issue4.html).toContain('14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016');
    expect(issue4.html).not.toContain('/launch-bundle');
    expect(issue4.html).not.toMatch(/\$\d/);
    const issue4es = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '004',
      locale: 'es',
      unsubscribeUrl: unsub,
    });
    expect(issue4es.subject).toBe('Dale al dinero de tu negocio su propio carril');
    expect(issue4es.html).toContain('lang="es"');
    expect(issue4es.html).toContain('1 de febrero de 2027');
    expect(issue4es.html).toContain('el 31 de enero cae domingo');
    expect(issue4es.html).toContain(`${SITE}/es/checklist`);
    expect(issue4es.html).toContain('https://www.irs.gov/es/forms-pubs/about-form-1099-nec');
    expect(issue4es.html).toContain('Cancelar suscripción');
    expect(issue4es.html).toContain('Preferencias de correo');
    expect(issue4es.html).toContain('Miami Lakes, FL 33016');
    expect(issue4es.html).toContain(unsub);
    expect(issue4es.html).not.toContain('February 1, 2027');
    expect(issue4es.html).not.toContain('/launch-bundle');
    expect(issue4es.html).not.toMatch(/\$\d/);
    expect(newsletterDeliveryLocale('004', 'es')).toBe('es');
    expect(newsletterDeliveryLocale('004', 'en')).toBe('en');
    expect(newsletterIssueCopy('004', 'es').subject).toBe('Dale al dinero de tu negocio su propio carril');

    const issue5 = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '005',
      locale: 'en',
      unsubscribeUrl: unsub,
    });
    expect(issue5.subject).toBe("Put your company's yearly dates on one calendar");
    expect(issue5.html).toContain('Florida LLC or corporation? Your annual report window opens January 1.');
    expect(issue5.html).toContain('January 1 and May 1');
    expect(issue5.html).toContain('September 17, 2027');
    expect(issue5.html).toContain('$400 late fee');
    expect(issue5.html).toContain('sunbiz.org');
    expect(issue5.html).toContain(`${SITE}/checklist`);
    expect(issue5.html).toContain(unsub);
    expect(issue5.html).toContain('Unsubscribe');
    expect(issue5.html).toContain('14160 Palmetto Frontage Rd, Suite 101, Miami Lakes, FL 33016');
    expect(issue5.html).not.toContain('/launch-bundle');
    expect(issue5.html).not.toMatch(/\$39|\$59|\$84|\$150|\$199|\$349/);
    const issue5es = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '005',
      locale: 'es',
      unsubscribeUrl: unsub,
    });
    expect(issue5es.subject).toBe('Pon las fechas anuales de tu empresa en un solo calendario');
    expect(issue5es.html).toContain('lang="es"');
    expect(issue5es.html).toContain('1 de enero y el 1 de mayo');
    expect(issue5es.html).toContain('17 de septiembre de 2027');
    expect(issue5es.html).toContain('recargo de $400');
    expect(issue5es.html).toContain(`${SITE}/es/checklist`);
    expect(issue5es.html).toContain('Cancelar suscripción');
    expect(issue5es.html).toContain('Preferencias de correo');
    expect(issue5es.html).toContain('LaunchForma no ofrece asesoría legal');
    expect(issue5es.html).toContain('Miami Lakes, FL 33016');
    expect(issue5es.html).toContain(unsub);
    expect(issue5es.html).not.toContain('Hi there,');
    expect(issue5es.html).not.toContain('September 17, 2027');
    expect(issue5es.html).not.toContain('/launch-bundle');
    expect(issue5es.html).not.toMatch(/\bgratis\b/i);
    expect(issue5es.html).not.toMatch(/despacho|bufete/i);
    expect(newsletterDeliveryLocale('005', 'es')).toBe('es');
    expect(newsletterDeliveryLocale('005', 'en')).toBe('en');
    const issue5other = renderTemplate('WEEKLY_NEWSLETTER', {
      newsletterIssue: '005',
      locale: 'fr',
      unsubscribeUrl: unsub,
    });
    expect(issue5other.subject).toBe(issue5.subject);
    expect(issue5other.html).toContain('lang="en"');
    expect(newsletterIssueCopy('005', 'es').subject).toBe(
      'Pon las fechas anuales de tu empresa en un solo calendario',
    );
    for (const number of ['001', '002', '003', '004', '005'] as const) {
      const weeklyEs = renderTemplate('WEEKLY_NEWSLETTER', {
        newsletterIssue: number,
        locale: 'es',
        unsubscribeUrl: unsub,
      });
      expect(weeklyEs.html).not.toMatch(/despacho|bufete/i);
      expect(weeklyEs.html).toContain('LaunchForma no ofrece asesoría legal');
      expect(weeklyEs.html).toContain(unsub);
    }

    const jobSource = readFileSync('lib/newsletter-job.ts', 'utf8');
    const dueAt = jobSource.indexOf('const issue = newsletterDueIssue');
    const localeAt = jobSource.indexOf('newsletterDeliveryLocale(issue');
    expect(dueAt).toBeGreaterThan(0);
    expect(localeAt).toBeGreaterThan(dueAt);

    const text = `${allNewsletterCopyText()}\n${allPostFormationCopyText()}`;
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');

    const page = readFileSync('app/(marketing)/checklist/page.tsx', 'utf8');
    expect(page).not.toContain('/oa/');
    const sql = readFileSync('prisma/migrations/20261025190000_email_programs/migration.sql', 'utf8');
    const issueSql = readFileSync(
      'prisma/migrations/20261028040000_newsletter_issues_003_004/migration.sql',
      'utf8',
    );
    const issue005Sql = readFileSync(
      'prisma/migrations/20261031120000_newsletter_issue_005/migration.sql',
      'utf8',
    );
    expect(issueSql).not.toContain('Obtén tu EIN de la forma correcta');
    expect(issue005Sql).not.toContain('Pon las fechas anuales de tu empresa en un solo calendario');
    expect(readFileSync('lib/newsletter.ts', 'utf8')).toContain('Obtén tu EIN de la forma correcta');
    expect(readFileSync('lib/newsletter.ts', 'utf8')).toContain('Dale al dinero de tu negocio su propio carril');
    expect(readFileSync('lib/newsletter.ts', 'utf8')).toContain(
      'Pon las fechas anuales de tu empresa en un solo calendario',
    );
    const storedSql = `${sql}\n${issueSql}\n${issue005Sql}`;
    for (const issue of STORED_NEWSLETTER_ISSUES) {
      expect(storedSql).toContain(issue.subject);
      expect(storedSql).toContain(issue.preview);
    }
    expect(issueSql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(issue005Sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    const job = readFileSync('lib/newsletter-job.ts', 'utf8');
    expect(job).toContain('sent002At');
    expect(job).toContain('sent003At');
    expect(job).toContain('sent004At');
    expect(job).toContain('replyTo: resumeEmailReplyTo()');
    expect(job).toContain('listUnsubscribeUrl');
    expect(sql).toContain('ALTER TABLE "NewsletterIssue" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "NewsletterSend" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "PostFormationSend" ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('CREATE POLICY');
    expect(sql).not.toContain('DELETE FROM');
  });
});
