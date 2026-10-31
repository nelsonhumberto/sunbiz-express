import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qaCookieSuppressesAds, shouldSuppressAdsConversion } from '@/lib/ads-conversions';
import {
  filingTestCreateFields,
  guestTesterCreateFields,
  hasQaCookie,
  paymentIntentIsTest,
  qaGuestStampPlan,
  qaMarkerPathAllowed,
  qaMarkerRequested,
  stripeIsTestMetadata,
  testTrafficProps,
} from '@/lib/qa-marker';
import { sendVitalsBeacon } from '@/lib/vitals-beacon';

describe('QA marker', () => {
  it('arms on qa=1 or a qa_ campaign, only on start and ad landings', () => {
    expect(qaMarkerRequested('?qa=1')).toBe(true);
    expect(qaMarkerRequested('qa=1&utm_source=google')).toBe(true);
    expect(qaMarkerRequested('?utm_campaign=qa_keeper')).toBe(true);
    expect(qaMarkerRequested('?utm_campaign=QA_Preview')).toBe(true);
    expect(qaMarkerRequested('?utm_campaign=quality')).toBe(false);
    expect(qaMarkerRequested('?utm_source=google')).toBe(false);
    expect(qaMarkerPathAllowed('/start')).toBe(true);
    expect(qaMarkerPathAllowed('/es/start')).toBe(true);
    expect(qaMarkerPathAllowed('/lp/florida-llc')).toBe(true);
    expect(qaMarkerPathAllowed('/es/lp/llc-florida')).toBe(true);
    expect(qaMarkerPathAllowed('/pricing')).toBe(false);
    expect(qaMarkerPathAllowed('/wizard/filing/2')).toBe(false);
  });

  it('flags PostHog from the QA cookie or the tester cookie, and suppresses Ads only for QA', () => {
    expect(hasQaCookie('theme=1; lf_qa=1')).toBe(true);
    expect(hasQaCookie('lf_qa=0')).toBe(false);
    expect(testTrafficProps('lf_qa=1')).toEqual({ is_test: true, is_internal: true });
    expect(testTrafficProps('lf_tester=1')).toEqual({ is_test: true, is_internal: true });
    expect(testTrafficProps('lf_utm=1')).toEqual({});
    expect(qaCookieSuppressesAds('lf_qa=1')).toBe(true);
    expect(qaCookieSuppressesAds('lf_tester=1')).toBe(false);
    expect(shouldSuppressAdsConversion({ qaMarked: true })).toBe(true);
    expect(shouldSuppressAdsConversion({ qaMarked: false, emails: ['ada@example.com'] })).toBe(false);
  });

  it('marks a guest draft and leaves a real account alone', () => {
    expect(qaGuestStampPlan({ emailHit: false, qaMarked: true, accountStatus: 'GUEST' })).toEqual({
      markUser: true,
      markFiling: true,
    });
    expect(qaGuestStampPlan({ emailHit: true, qaMarked: false, accountStatus: 'ACTIVE' })).toEqual({
      markUser: true,
      markFiling: true,
    });
    expect(qaGuestStampPlan({ emailHit: false, qaMarked: true, accountStatus: 'ACTIVE' })).toEqual({
      markUser: false,
      markFiling: true,
    });
    expect(qaGuestStampPlan({ emailHit: false, qaMarked: false, accountStatus: 'GUEST' })).toEqual({
      markUser: false,
      markFiling: false,
    });
  });

  it('sets isTest on the filing insert and on the Stripe PaymentIntent', () => {
    expect(filingTestCreateFields({ qaMarked: true, isTester: false })).toEqual({ isTest: true });
    expect(filingTestCreateFields({ qaMarked: false, isTester: true })).toEqual({ isTest: true });
    expect(filingTestCreateFields({ qaMarked: false, isTester: false })).toEqual({});
    expect(guestTesterCreateFields({ qaMarked: true })).toEqual({ isTester: true });
    expect(guestTesterCreateFields({ emailHit: true })).toEqual({ isTester: true });
    expect(guestTesterCreateFields({})).toEqual({});
    expect(paymentIntentIsTest({ qaMarked: true })).toBe(true);
    expect(paymentIntentIsTest({ filingIsTest: true })).toBe(true);
    expect(paymentIntentIsTest({ isTester: true })).toBe(true);
    expect(paymentIntentIsTest({})).toBe(false);
    expect(stripeIsTestMetadata(true)).toEqual({ isTest: 'true' });
    expect(stripeIsTestMetadata(false)).toEqual({});

    const creators = [
      'actions/guest-start.ts',
      'actions/filings.ts',
      'actions/annual-report.ts',
      'actions/linked-entity.ts',
      'lib/assistant/tools.ts',
    ];
    for (const file of creators) {
      const source = readFileSync(file, 'utf8');
      const creates = source.split('.filing.create(').length - 1;
      const flags = source.split('filingTestCreateFields(').length - 1;
      expect(creates, file).toBeGreaterThan(0);
      expect(flags, file).toBe(creates);
    }
    const guestStart = readFileSync('actions/guest-start.ts', 'utf8');
    expect(guestStart.split('guestTesterCreateFields(').length - 1).toBe(2);
    expect(readFileSync('components/marketing/FloridaLlcLanding.tsx', 'utf8')).toContain('openGuestDraft(');
    const payments = readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8');
    expect(payments.split('stripeIsTestMetadata(').length - 1).toBe(4);
    const analytics = readFileSync('lib/analytics.ts', 'utf8');
    const lead = analytics.slice(
      analytics.indexOf('export function trackGoogleLead'),
      analytics.indexOf('export function trackOpenAiLead'),
    );
    expect(lead.indexOf('shouldSuppressAdsConversion')).toBeLessThan(
      lead.indexOf("gtag('event', 'conversion'"),
    );
  });

  it('puts Continue under the name field and submits on Enter for the mobile keyboard', () => {
    const launch = readFileSync('app/start/guest-start-launch.tsx', 'utf8');
    const name = launch.indexOf('id="businessName"');
    const submit = launch.indexOf('type="submit"');
    const help = launch.indexOf('id="start-name-help"');
    expect(name).toBeGreaterThan(-1);
    expect(name).toBeLessThan(submit);
    expect(submit).toBeLessThan(help);
    expect(launch).toContain('enterKeyHint="go"');
    expect(launch).toContain("matchMedia('(max-width: 767px)')");
    expect(launch).toContain('visualViewport');
    expect(launch).toContain("addEventListener('resize', onResize)");
    expect(launch).toContain("removeEventListener('resize', onResize)");
    expect(launch).toContain('setNameFocused(false)');
  });

  it('registers the flags before the first PostHog pageview', () => {
    const browser = readFileSync('lib/posthog-browser.ts', 'utf8');
    const persist = browser.indexOf('persistQaMarker(window.location.pathname, window.location.search)');
    const init = browser.indexOf('posthog.init(');
    expect(persist).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(persist);
    expect(browser).toContain('before_send: withAttribution');
    expect(browser).toContain('currentTestTraffic()');
    expect(browser.indexOf('function withAttribution')).toBeLessThan(init);
    expect(readFileSync('app/layout.tsx', 'utf8')).toContain('window.__lf_tester=1');
  });
});

describe('vitals beacon', () => {
  it('uses sendBeacon and falls back to keepalive fetch', () => {
    const beacon = viBeacon();
    expect(sendVitalsBeacon('https://vitals.vercel-insights.com/v1/vitals', 'a=1', beacon)).toBe(true);
    expect(beacon.sent).toEqual(['https://vitals.vercel-insights.com/v1/vitals']);
    expect(beacon.fetched).toEqual([]);

    const failed = viBeacon(false);
    expect(sendVitalsBeacon('/_vercel/speed-insights/vitals', 'b=1', failed)).toBe(true);
    expect(failed.fetched[0]?.keepalive).toBe(true);
    expect(failed.fetched[0]?.url).toBe('/_vercel/speed-insights/vitals');
  });
});

function viBeacon(beaconOk = true): {
  sent: string[];
  fetched: Array<{ url: string; keepalive?: boolean }>;
  sendBeacon: (url: string, body: BodyInit) => boolean;
  fetch: (url: string, init: RequestInit) => Promise<unknown>;
} {
  const sent: string[] = [];
  const fetched: Array<{ url: string; keepalive?: boolean }> = [];
  return {
    sent,
    fetched,
    sendBeacon: (url) => {
      if (!beaconOk) return false;
      sent.push(url);
      return true;
    },
    fetch: (url, init) => {
      fetched.push({ url, keepalive: init.keepalive });
      return Promise.resolve();
    },
  };
}
