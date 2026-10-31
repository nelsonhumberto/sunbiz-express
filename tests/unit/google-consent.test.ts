import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  applyGoogleConsent,
  applyGoogleTesterRedaction,
  GOOGLE_CONSENT_DENIED,
  GOOGLE_CONSENT_GRANTED,
  googleConsentChoice,
  googleTagBootstrap,
  googleTagLoaderId,
  isGoogleTesterBrowser,
  shouldLoadGoogleTags,
} from '@/lib/google-consent';

describe('Google Consent Mode bootstrap', () => {
  it('sets default denied before any config, then grants a stored Accept before config', () => {
    const script = googleTagBootstrap({
      gaId: 'G-SSYG3R6NHM',
      adsId: 'AW-18328422146',
    });
    const strip = script.indexOf("searchParams.delete('li_fat_id')");
    const denied = script.indexOf("gtag('consent', 'default'");
    const granted = script.indexOf("gtag('consent', 'update'");
    const js = script.indexOf("gtag('js'");
    const configGa = script.indexOf("gtag('config', 'G-SSYG3R6NHM'");
    const configAw = script.indexOf("gtag('config', 'AW-18328422146'");

    expect(strip).toBeGreaterThan(-1);
    expect(denied).toBeGreaterThan(strip);
    expect(granted).toBeGreaterThan(denied);
    expect(js).toBeGreaterThan(granted);
    expect(configGa).toBeGreaterThan(js);
    expect(configAw).toBeGreaterThan(configGa);

    for (const [key, value] of Object.entries(GOOGLE_CONSENT_DENIED)) {
      expect(script).toContain(`${key}: '${value}'`);
    }
    for (const [key, value] of Object.entries(GOOGLE_CONSENT_GRANTED)) {
      expect(script).toContain(`${key}: '${value}'`);
    }
    expect(script).toContain('wait_for_update: 500');
    expect(script).toContain('lf_ads_consent=all');
    expect(script).toContain('lf_ad_optout=1');
    expect(script.indexOf("gtag('config'")).toBe(configGa);
  });

  it('loads gtag.js from either measurement id', () => {
    expect(googleTagLoaderId('G-SSYG3R6NHM', 'AW-18328422146')).toBe(
      'G-SSYG3R6NHM',
    );
    expect(googleTagLoaderId(undefined, 'AW-18328422146')).toBe(
      'AW-18328422146',
    );
    expect(googleTagLoaderId('', '')).toBeNull();
    expect(googleTagBootstrap({ gaId: 'bad id', adsId: 'AW-1' })).toContain(
      "gtag('config', 'AW-1'",
    );
    expect(googleTagBootstrap({ gaId: 'bad id', adsId: 'AW-1' })).not.toContain(
      'bad id',
    );
  });

  it('updates all four signals on Accept and on decline', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });
    expect(googleConsentChoice({ consent: null, optedOut: false })).toBe(
      'denied',
    );
    expect(googleConsentChoice({ consent: 'essential', optedOut: false })).toBe(
      'denied',
    );
    expect(googleConsentChoice({ consent: 'all', optedOut: false })).toBe(
      'granted',
    );
    expect(googleConsentChoice({ consent: 'all', optedOut: true })).toBe(
      'denied',
    );

    applyGoogleConsent('granted');
    applyGoogleConsent('denied');
    expect(gtag).toHaveBeenNthCalledWith(1, 'consent', 'update', {
      ...GOOGLE_CONSENT_GRANTED,
    });
    expect(gtag).toHaveBeenNthCalledWith(2, 'consent', 'update', {
      ...GOOGLE_CONSENT_DENIED,
    });
    vi.unstubAllGlobals();
  });

  it('keeps consent denied for a QA or tester browser after Accept and redacts ads', () => {
    expect(
      googleConsentChoice({ consent: 'all', optedOut: false, tester: true }),
    ).toBe('denied');
    expect(
      googleConsentChoice({ consent: 'all', optedOut: false, tester: false }),
    ).toBe('granted');

    const script = googleTagBootstrap({ gaId: 'G-1', adsId: 'AW-1' });
    const redact = script.indexOf("gtag('set', 'ads_data_redaction', true)");
    const personalization = script.indexOf(
      "gtag('set', 'allow_ad_personalization_signals', false)",
    );
    const config = script.indexOf("gtag('config'");
    expect(script).toContain('lf_qa=1');
    expect(script).toContain('lf_tester=1');
    expect(script).toContain('__lf_tester');
    expect(redact).toBeGreaterThan(-1);
    expect(personalization).toBeGreaterThan(redact);
    expect(config).toBeGreaterThan(personalization);
    expect(script.indexOf('else if (lfAccepted')).toBeGreaterThan(personalization);

    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag, __lf_tester: 1 });
    vi.stubGlobal('document', { cookie: 'lf_ads_consent=all' });
    expect(isGoogleTesterBrowser()).toBe(true);
    const signedIn = googleConsentChoice({
      consent: 'all',
      optedOut: false,
      tester: isGoogleTesterBrowser(),
    });
    applyGoogleConsent(signedIn);
    applyGoogleTesterRedaction();

    vi.stubGlobal('window', { gtag });
    vi.stubGlobal('document', { cookie: 'lf_ads_consent=all; lf_qa=1' });
    expect(isGoogleTesterBrowser()).toBe(true);
    vi.stubGlobal('document', { cookie: 'lf_ads_consent=all; lf_tester=1' });
    expect(isGoogleTesterBrowser()).toBe(true);
    vi.stubGlobal('document', { cookie: 'lf_ads_consent=all' });
    expect(isGoogleTesterBrowser()).toBe(false);

    expect(signedIn).toBe('denied');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ...GOOGLE_CONSENT_DENIED,
    });
    expect(gtag).toHaveBeenCalledWith('set', 'ads_data_redaction', true);
    expect(gtag).toHaveBeenCalledWith(
      'set',
      'allow_ad_personalization_signals',
      false,
    );
    expect(gtag).not.toHaveBeenCalledWith(
      'consent',
      'update',
      expect.objectContaining({ ad_storage: 'granted' }),
    );
    vi.unstubAllGlobals();
  });

  it('does not load gtag for a tester unless the preview proof is on', () => {
    expect(
      shouldLoadGoogleTags({ optedOut: false, tester: true, adsDebug: false }),
    ).toBe(false);
    expect(
      shouldLoadGoogleTags({ optedOut: false, tester: true, adsDebug: true }),
    ).toBe(true);
    expect(
      shouldLoadGoogleTags({ optedOut: true, tester: true, adsDebug: true }),
    ).toBe(false);
    expect(
      shouldLoadGoogleTags({ optedOut: false, tester: false, adsDebug: false }),
    ).toBe(true);
    const gate = readFileSync('components/analytics/AdMeasurementGate.tsx', 'utf8');
    expect(gate).toContain('shouldLoadGoogleTags');
    expect(gate).toContain('adsDebugActive');
  });
});
