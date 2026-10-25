import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { localizedRedirectHref } from '@/lib/app-href';
import {
  hasInternalTrafficCookie,
  internalTrafficCookie,
  internalTrafficQueryRequested,
  isInternalBrowserSignal,
  isInternalTrafficUser,
  isInternalUserAgent,
  signInHrefPreservingInternal,
} from '@/lib/internal-traffic';
import { middleware } from '../../middleware';

describe('internal PostHog traffic', () => {
  it('flags admins, company domains, and the named mailboxes', () => {
    expect(isInternalTrafficUser({ role: 'ADMIN', email: 'buyer@example.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'Ada@LaunchForma.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@launchforma.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'nelsonhumberto@gmail.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ops@intelepeer.ai' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ops@aqurio.com' })).toBe(true);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@sub.launchforma.com' })).toBe(false);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@launchforma.com.evil' })).toBe(false);
    expect(isInternalTrafficUser({ role: 'USER', email: 'ada@intelepeer.ai.evil' })).toBe(false);
    expect(isInternalTrafficUser({ role: 'USER', email: 'not-an-email' })).toBe(false);
    expect(isInternalTrafficUser(null)).toBe(false);
  });

  it('flags automation user agents, the query flag, and the stored flag', () => {
    expect(isInternalUserAgent('Mozilla/5.0 HeadlessChrome/120.0')).toBe(true);
    expect(isInternalUserAgent('Playwright/1.40')).toBe(true);
    expect(isInternalUserAgent('Mozilla/5.0 (compatible; Puppeteer)')).toBe(true);
    expect(isInternalUserAgent('Mozilla/5.0 lf-qa')).toBe(true);
    expect(isInternalUserAgent('Mozilla/5.0 Chrome/120.0')).toBe(false);
    expect(internalTrafficQueryRequested('?utm_source=google&lf_internal=1')).toBe(true);
    expect(internalTrafficQueryRequested('?lf_internal=0')).toBe(false);
    expect(hasInternalTrafficCookie('lf_utm=1; lf_internal=1')).toBe(true);
    expect(hasInternalTrafficCookie('lf_internal=0')).toBe(false);
    expect(internalTrafficCookie(true)).toContain('lf_internal=1');
    expect(internalTrafficCookie(true)).toContain('Secure');
    expect(
      isInternalBrowserSignal({
        userAgent: 'Chrome',
        search: '',
        cookie: '',
        storedFlag: '1',
      }),
    ).toBe(true);
  });

  it('registers is_internal and sets the person property for those sessions', () => {
    const analytics = readFileSync('lib/analytics.ts', 'utf8');
    expect(analytics).toContain('client.register({ is_internal: true })');
    expect(analytics).toContain('client.identify(userId, traits)');
    expect(analytics).toContain('is_internal: true');
    expect(analytics).toContain('client.setPersonProperties?.({ is_internal: true })');

    const browser = readFileSync('lib/posthog-browser.ts', 'utf8');
    expect(browser).toContain("POSTHOG_ENV === 'production'");
    expect(browser).toContain('client.register({ is_internal: true })');
    expect(browser).toContain('localStorage.setItem(INTERNAL_TRAFFIC_FLAG');

    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain('<InternalTrafficFlag');
    const flag = readFileSync('components/analytics/InternalTrafficFlag.tsx', 'utf8');
    expect(flag).toContain('isInternalTrafficUser');
    expect(flag).toContain('markInternalTraffic');
  });

  it('forwards only lf_internal=1 onto the dashboard sign-in redirect', () => {
    expect(signInHrefPreservingInternal(false)).toBe('/sign-in');
    expect(signInHrefPreservingInternal(true)).toBe('/sign-in?lf_internal=1');
    expect(localizedRedirectHref('/sign-in?lf_internal=1', 'en')).toBe('/sign-in?lf_internal=1');
    expect(localizedRedirectHref('/sign-in?lf_internal=1', 'es')).toBe('/es/sign-in?lf_internal=1');

    function forwarded(path: string) {
      const request = new NextRequest(new URL(path, 'https://launchforma.com'), {
        headers: { host: 'launchforma.com' },
      });
      return middleware(request).headers.get('x-middleware-request-x-lf-internal');
    }

    expect(forwarded('/dashboard?lf_internal=1&utm_source=google&gclid=abc')).toBe('1');
    expect(forwarded('/es/dashboard?utm_campaign=qa&lf_internal=1')).toBe('1');
    expect(forwarded('/dashboard?utm_source=google&gclid=abc')).toBeNull();
    expect(forwarded('/es/dashboard?lf_internal=0')).toBeNull();

    const gate = readFileSync('lib/sign-in-gate.ts', 'utf8');
    expect(gate).toContain('signInHrefPreservingInternal');
    expect(gate).toContain('redirectLocalized');
  });
});
