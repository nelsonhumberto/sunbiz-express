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
import {
  isPostFormationSeriesEnabled,
  isSignupCaptureEnabled,
  isWeeklyNewsletterEnabled,
} from '@/lib/feature-flags';
import {
  newsletterSendKey,
  planMarketingClaim,
  postFormationSendKey,
} from '@/lib/marketing-send-claim';
import {
  addEtDays,
  allNewsletterCopyText,
  firstWeekdayMorningEt,
  isEtWeekdayMorning,
  isNewsletterRecipient,
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
import { readUnsubscribeToken, signUnsubscribeToken, unsubscribeLink } from '@/lib/unsubscribe';

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
  it('confirms in one click and refreshes the same row when repeated', () => {
    const route = readFileSync('app/unsubscribe/route.ts', 'utf8');
    const getStart = route.indexOf('export async function GET');
    const postStart = route.indexOf('export async function POST');
    expect(route.slice(getStart, postStart)).toContain('recordOptOut');
    expect(route).toContain('prisma.marketingOptOut.upsert');
    expect(route).toContain("update: { source: 'unsubscribe' }");
    expect(route).not.toContain('update: {}');
    const link = unsubscribeLink(SITE, 'Ada@Example.com', SECRET);
    const token = new URL(link).searchParams.get('token') ?? '';
    expect(readUnsubscribeToken(token, SECRET)).toBe('ada@example.com');
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
    expect(planMarketingClaim({ status: 'FAILED', claimedAt: fresh }, now)).toBe('reclaim');
    expect(postFormationSendKey('fil_1', 'DAY_3')).toBe('fil_1:DAY_3');
    expect(newsletterSendKey('Ada@Example.com', '001')).toBe('ada@example.com:001');
    expect(newsletterSendKey('Ada@Example.com', '002')).not.toBe(newsletterSendKey('ada@example.com', '001'));
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
    expect(addEtDays(schedule.issue001, 7).toISOString()).toBe(schedule.issue002.toISOString());

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

    const text = `${allNewsletterCopyText()}\n${allPostFormationCopyText()}`;
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');

    const page = readFileSync('app/(marketing)/checklist/page.tsx', 'utf8');
    expect(page).not.toContain('/oa/');
    const sql = readFileSync('prisma/migrations/20261025190000_email_programs/migration.sql', 'utf8');
    for (const issue of STORED_NEWSLETTER_ISSUES) {
      expect(sql).toContain(issue.subject);
      expect(sql).toContain(issue.preview);
    }
    expect(sql).toContain('ALTER TABLE "NewsletterIssue" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "NewsletterSend" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "PostFormationSend" ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('CREATE POLICY');
    expect(sql).not.toContain('DELETE FROM');
  });
});
