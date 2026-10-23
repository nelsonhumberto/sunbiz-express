import { describe, expect, it } from 'vitest';
import { localeAlternates } from '@/lib/locale-seo';
import {
  isSpanishPublicPath,
  localizedHref,
  pathForLocale,
  toSpanishUrl,
} from '@/lib/locale-paths';
import es from '../../messages/es.json';

describe('Spanish URL paths', () => {
  it('maps the homepage to /es and never back to /', () => {
    expect(toSpanishUrl('/')).toBe('/es');
    expect(toSpanishUrl('/about')).toBe('/es/about');
    expect(toSpanishUrl('/states/delaware')).toBe('/es/states/delaware');
    expect(toSpanishUrl('/pricing?state=WY')).toBe('/es/pricing?state=WY');
    expect(toSpanishUrl('/?state=TX')).toBe('/es?state=TX');
  });

  it('keeps the current page path when switching language', () => {
    expect(pathForLocale('/es/services', 'en')).toBe('/services');
    expect(pathForLocale('/services', 'es')).toBe('/es/services');
    expect(pathForLocale('/es', 'en')).toBe('/');
    expect(pathForLocale('/', 'es')).toBe('/es');
    expect(pathForLocale('/es/file-annual-report?utm_source=ig', 'en')).toBe(
      '/file-annual-report?utm_source=ig',
    );
    expect(pathForLocale('/guides/florida-llc-operating-agreement', 'es')).toBe(
      '/es/guides/florida-llc-operating-agreement',
    );
  });

  it('prefixes in-app links only while Spanish is active', () => {
    expect(localizedHref('/pricing', 'es')).toBe('/es/pricing');
    expect(localizedHref('/start?state=FL', 'es')).toBe('/es/start?state=FL');
    expect(localizedHref('/pricing', 'en')).toBe('/pricing');
    expect(localizedHref('mailto:hello@launchforma.com', 'es')).toBe(
      'mailto:hello@launchforma.com',
    );
  });
});

describe('hreflang alternates', () => {
  it('points es at /es and x-default at English, on both locales', () => {
    const english = localeAlternates('/', '/');
    const spanish = localeAlternates('/', '/es');
    expect(english.languages).toEqual({ en: '/', es: '/es', 'x-default': '/' });
    expect(spanish.languages).toEqual(english.languages);
    expect(english.canonical).toBe('/');
    expect(spanish.canonical).toBe('/es');
    expect(english.languages?.es).not.toBe('/');
    expect(english.languages?.es).not.toBe('/?lang=es');
  });

  it('self-canonicalizes each /es page and pairs state pages', () => {
    const fromEnglish = localeAlternates('/states/wyoming', '/states/wyoming');
    const fromSpanish = localeAlternates('/states/wyoming', '/es/states/wyoming');
    expect(fromEnglish.canonical).toBe('/states/wyoming');
    expect(fromSpanish.canonical).toBe('/es/states/wyoming');
    expect(fromSpanish.languages?.es).toBe('/es/states/wyoming');
    expect(fromSpanish.languages?.en).toBe('/states/wyoming');
    expect(fromSpanish.languages?.['x-default']).toBe('/states/wyoming');
    expect(isSpanishPublicPath('/es/guides')).toBe(true);
    expect(isSpanishPublicPath('/guides')).toBe(false);
  });
});

describe('new Spanish copy', () => {
  it('does not use em dashes or en dashes', () => {
    const namespaces = [
      'servicesPage',
      'aboutPage',
      'statesPage',
      'annualReportPage',
      'annualReportHome',
      'boiPage',
      'guidesPage',
      'guideOa',
      'guideWyDe',
      'legalDraft',
      'legalTerms',
      'legalPrivacy',
      'legalDisclaimer',
      'legalRefund',
      'stateTiming',
    ] as const;
    const messages = es as Record<string, unknown>;
    for (const name of namespaces) {
      const blob = JSON.stringify(messages[name] ?? '');
      expect(blob, name).not.toMatch(/—|–/);
    }
  });
});
