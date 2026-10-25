import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SESSION_REPLAY_BLOCKED_EXACT,
  SESSION_REPLAY_BLOCKED_MEDIA,
  SESSION_REPLAY_BLOCKED_PREFIXES,
  canonicalReplayPath,
  isSessionReplayBlockedPath,
  sessionRecordingPrivacy,
  sessionReplayAllowed,
} from '@/lib/session-replay';

const blocked = [
  '/dashboard',
  '/dashboard/',
  '/dashboard/billing',
  '/dashboard/filings/filing_1',
  '/dashboard/filings/filing_1/certificates/certificate-of-status',
  '/dashboard/settings?tab=profile',
  '/es/dashboard',
  '/es/dashboard/',
  '/es/dashboard/documents',
  '/es/dashboard/filings/filing_1/ein#form',
  '/admin',
  '/admin/filings',
  '/admin/filings/filing_1',
  '/admin/users',
  '/es/admin',
  '/es/admin/drafts',
  '/start',
  '/start/',
  '/start?state=FL&name=Acme',
  '/es/start',
  '/es/start?state=FL',
  '/wizard/filing_1/1',
  '/wizard/filing_1/11',
  '/wizard/filing_1/11?addon=ein',
  '/es/wizard/filing_1/2',
  '/es/wizard/filing_1/11',
  '/checkout',
  '/checkout/success',
  '/checkout/success?session=cs_test&filing=filing_1',
  '/es/checkout',
  '/es/checkout/success',
  '/es/checkout/success?filing=filing_1#done',
  '/sign-in',
  '/sign-in/',
  '/sign-in?next=%2Fdashboard',
  '/es/sign-in',
  '/sign-up',
  '/es/sign-up',
  '/reset-password',
  '/reset-password?token=secret',
  '/es/reset-password',
  '/es/reset-password?token=secret#form',
  '/resume',
  '/resume?f=filing_1&t=guest-token',
  '/es/resume',
  '/es/resume?f=filing_1&t=guest-token',
];

const allowed = [
  '/',
  '/es',
  '/es/',
  '/pricing',
  '/pricing?utm_source=google#tiers',
  '/es/pricing',
  '/business-services',
  '/business-services/thank-you',
  '/es/business-services/thank-you',
  '/faq',
  '/states/florida',
  '/es/states/florida',
  '/guides/how-to-form-an-llc-in-florida',
  '/offer',
  '/checklist',
  '/tools/utm-builder',
  '/forgot-password',
  '/login-link',
  '/privacy',
  '/terms',
  '/starting',
  '/dashboarding',
  '/administration',
  '/sign-in-help',
  '/checkout-policy',
  '/resume-later',
];

describe('session replay routes', () => {
  it('blocks customer, wizard, checkout, admin, auth, and resume routes in EN and ES', () => {
    for (const path of blocked) {
      expect(isSessionReplayBlockedPath(path), path).toBe(true);
    }
  });

  it('leaves marketing and other public routes recordable', () => {
    for (const path of allowed) {
      expect(isSessionReplayBlockedPath(path), path).toBe(false);
    }
  });

  it('strips the Spanish prefix, query, hash, and trailing slash before matching', () => {
    expect(canonicalReplayPath('/es/dashboard/billing/?tab=1#card')).toBe('/dashboard/billing');
    expect(canonicalReplayPath('/es/reset-password?token=abc#x')).toBe('/reset-password');
    expect(canonicalReplayPath('/es')).toBe('/');
    expect(canonicalReplayPath('/es/')).toBe('/');
  });

  it('stops replay when either the address bar or the rewritten pathname is sensitive', () => {
    expect(sessionReplayAllowed(['/pricing', '/es/pricing'])).toBe(true);
    expect(sessionReplayAllowed(['/es/dashboard', '/dashboard'])).toBe(false);
    expect(sessionReplayAllowed(['/pricing', '/dashboard/billing'])).toBe(false);
    expect(sessionReplayAllowed(['/checkout/success', '/es/checkout/success'])).toBe(false);
    expect(sessionReplayAllowed([null, undefined, '/faq'])).toBe(true);
  });

  it('covers the requested prefixes and exact auth/resume pages', () => {
    expect(SESSION_REPLAY_BLOCKED_PREFIXES).toEqual([
      '/dashboard',
      '/admin',
      '/wizard',
      '/checkout',
      '/start',
    ]);
    expect(SESSION_REPLAY_BLOCKED_EXACT).toEqual([
      '/sign-in',
      '/sign-up',
      '/reset-password',
      '/resume',
    ]);
  });
});

describe('session replay masking', () => {
  it('masks every input and all text, and blocks images and media', () => {
    expect(sessionRecordingPrivacy.maskAllInputs).toBe(true);
    expect(sessionRecordingPrivacy.maskTextSelector).toBe('*');
    expect(sessionRecordingPrivacy.blockSelector).toBe(SESSION_REPLAY_BLOCKED_MEDIA.join(', '));
    for (const element of ['img', 'image', 'picture', 'video', 'audio', 'canvas', 'svg', 'iframe']) {
      expect(sessionRecordingPrivacy.blockSelector.split(', ')).toContain(element);
    }
  });

  it('applies that config in production and toggles replay on client navigations', () => {
    const browser = readFileSync('lib/posthog-browser.ts', 'utf8');
    const gate = browser.indexOf("POSTHOG_ENV === 'production'");
    const init = browser.indexOf('posthog.init(');
    expect(gate).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(gate);
    expect(browser).toContain('capture_pageview: \'history_change\'');
    expect(browser).toContain('client.register({ is_internal: true })');
    expect(browser).toContain('disable_session_recording: isSessionReplayBlockedPath(window.location.pathname)');
    expect(browser).toContain('maskAllInputs: sessionRecordingPrivacy.maskAllInputs');
    expect(browser).toContain('maskTextSelector: sessionRecordingPrivacy.maskTextSelector');
    expect(browser).toContain('blockSelector: sessionRecordingPrivacy.blockSelector');
    expect(browser).toContain('posthog.stopSessionRecording()');
    expect(browser).toContain('posthog.startSessionRecording()');
    expect(browser).toContain('window.history.pushState');
    expect(browser).toContain('window.history.replaceState');
    expect(browser).toContain("window.addEventListener('popstate', notify)");

    const route = readFileSync('components/analytics/SessionReplayRoute.tsx', 'utf8');
    expect(route).toContain('usePathname()');
    expect(route).toContain('syncSessionReplay(pathname)');
    const provider = readFileSync('components/analytics/PostHogProvider.tsx', 'utf8');
    expect(provider).toContain('<SessionReplayRoute />');
  });
});
