import { describe, expect, it } from 'vitest';
import { marketingTagsAllowed, readAdsConsent, shouldShowCookieNotice } from '@/lib/ad-consent';
import { newlyReachedScrollDepths } from '@/lib/scroll-depth';
import { readFileSync } from 'node:fs';

describe('landing tracking and consent', () => {
  it('emits each scroll milestone once', () => {
    const seen = new Set<number>();
    expect(newlyReachedScrollDepths(10, seen)).toEqual([]);
    expect(newlyReachedScrollDepths(25, seen)).toEqual([25]);
    seen.add(25);
    expect(newlyReachedScrollDepths(80, seen)).toEqual([50, 75]);
    seen.add(50);
    seen.add(75);
    expect(newlyReachedScrollDepths(100, seen)).toEqual([100]);
    expect(newlyReachedScrollDepths(Number.NaN, seen)).toEqual([]);
  });

  it('loads Google tags only after accept, and an opt-out still blocks them', () => {
    expect(readAdsConsent('theme=1; lf_ads_consent=all')).toBe('all');
    expect(readAdsConsent('lf_ads_consent=essential')).toBe('essential');
    expect(readAdsConsent('')).toBeNull();
    expect(marketingTagsAllowed({ consent: null, optedOut: false })).toBe(false);
    expect(marketingTagsAllowed({ consent: 'essential', optedOut: false })).toBe(false);
    expect(marketingTagsAllowed({ consent: 'all', optedOut: false })).toBe(true);
    expect(marketingTagsAllowed({ consent: 'all', optedOut: true })).toBe(false);
    expect(shouldShowCookieNotice({ consent: null, optedOut: false })).toBe(true);
    expect(shouldShowCookieNotice({ consent: 'all', optedOut: false })).toBe(false);
    expect(shouldShowCookieNotice({ consent: 'essential', optedOut: false })).toBe(false);
    expect(shouldShowCookieNotice({ consent: null, optedOut: true })).toBe(false);
    const bar = readFileSync('components/analytics/CookieConsentBar.tsx', 'utf8');
    expect(bar).toContain('role="region"');
    expect(bar).not.toContain('role="dialog"');
    expect(bar).not.toContain('fixed inset-0');
    expect(bar).toContain('min-h-11');
    expect(bar).toContain('requestIdleCallback');
    expect(bar).not.toContain('overflow-hidden');
    expect(bar).toContain('--lf-cookie-h');
    expect(readFileSync('components/marketing/FloridaLlcLanding.tsx', 'utf8')).toContain(
      "bottom: 'var(--lf-cookie-h, 0px)'",
    );
    expect(readFileSync('messages/en.json', 'utf8')).toContain('We use cookies to improve your visit.');
    expect(readFileSync('messages/es.json', 'utf8')).toContain('Usamos cookies para mejorar tu visita.');
  });

  it('wires lead capture, scroll depth, and checkout events', () => {
    const landing = readFileSync('components/marketing/FloridaLlcLanding.tsx', 'utf8');
    const payment = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');
    const success = readFileSync('components/analytics/CheckoutConversionTracker.tsx', 'utf8');
    const gate = readFileSync('components/analytics/AdMeasurementGate.tsx', 'utf8');
    expect(landing).toContain("source: 'lp-florida-llc'");
    expect(landing).toContain('captureChecklistSignup');
    expect(landing).toContain("trackEvent('lead_capture_submitted'");
    expect(landing).toContain("trackEvent('scroll_depth'");
    expect(landing).toContain("trackCtaClicked('lp_continue'");
    expect(landing).toContain('email: leadEmail.trim() || undefined');
    expect(payment).toContain("trackEvent('checkout_started'");
    expect(success).toContain("trackEvent('checkout_paid'");
    expect(gate).toContain('marketingTagsAllowed');
    expect(readFileSync('actions/checklist-signup.ts', 'utf8')).toContain('getServerUtmAttribution');
    expect(readFileSync('actions/guest-start.ts', 'utf8')).toContain('rememberStartEmail');
  });
});
