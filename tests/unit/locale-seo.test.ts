import { describe, expect, it } from 'vitest';
import { englishOnlyAlternates, localeAlternates, spanishOnlyAlternates } from '@/lib/locale-seo';
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
    expect(toSpanishUrl('/contact')).toBe('/es/contacto');
    expect(toSpanishUrl('/contact?utm_source=ig')).toBe('/es/contacto?utm_source=ig');
    expect(toSpanishUrl('/states/florida')).toBe('/es/states/florida');
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
    expect(pathForLocale('/contact', 'es')).toBe('/es/contacto');
    expect(pathForLocale('/es/contacto', 'en')).toBe('/contact');
    expect(pathForLocale('/es/contacto?utm_source=ig', 'en')).toBe('/contact?utm_source=ig');
  });

  it('prefixes in-app links only while Spanish is active', () => {
    expect(localizedHref('/pricing', 'es')).toBe('/es/pricing');
    expect(localizedHref('/start?state=FL', 'es')).toBe('/es/start?state=FL');
    expect(localizedHref('/pricing', 'en')).toBe('/pricing');
    expect(localizedHref('/contact', 'es')).toBe('/es/contacto');
    expect(localizedHref('/contact', 'en')).toBe('/contact');
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
    const fromEnglish = localeAlternates('/states/florida', '/states/florida');
    const fromSpanish = localeAlternates('/states/florida', '/es/states/florida');
    expect(fromEnglish.canonical).toBe('/states/florida');
    expect(fromSpanish.canonical).toBe('/es/states/florida');
    expect(fromSpanish.languages?.es).toBe('/es/states/florida');
    expect(fromSpanish.languages?.en).toBe('/states/florida');
    expect(fromSpanish.languages?.['x-default']).toBe('/states/florida');
    expect(isSpanishPublicPath('/es/guides')).toBe(true);
    expect(isSpanishPublicPath('/guides')).toBe(false);
  });

  it('omits es on English-only guides so hreflang does not point at a missing page', () => {
    const path = '/guides/florida-fictitious-name-dba';
    const alternates = englishOnlyAlternates(path);
    expect(alternates.canonical).toBe(path);
    expect(alternates.languages).toEqual({
      en: path,
      'x-default': path,
    });
    expect(alternates.languages).not.toHaveProperty('es');
  });

  it('omits en on Spanish-only guides so hreflang does not point at a redirect', () => {
    const esPath = '/es/guides/llc-para-tu-app-florida';
    const alternates = spanishOnlyAlternates(esPath);
    expect(alternates.canonical).toBe(esPath);
    expect(alternates.languages).toEqual({
      es: esPath,
      'x-default': esPath,
    });
    expect(alternates.languages).not.toHaveProperty('en');
  });

  it('pairs /contact with /es/contacto', () => {
    const fromEnglish = localeAlternates('/contact', '/contact');
    const fromSpanish = localeAlternates('/contact', '/es/contacto');
    expect(fromEnglish.canonical).toBe('/contact');
    expect(fromSpanish.canonical).toBe('/es/contacto');
    expect(fromSpanish.languages).toEqual({
      en: '/contact',
      es: '/es/contacto',
      'x-default': '/contact',
    });
    expect(fromEnglish.languages).toEqual(fromSpanish.languages);
  });

  it('gives /es/start its own canonical and an English alternate', () => {
    const fromSpanish = localeAlternates('/start', '/es/start');
    expect(fromSpanish.canonical).toBe('/es/start');
    expect(fromSpanish.languages).toEqual({
      en: '/start',
      es: '/es/start',
      'x-default': '/start',
    });
    const start = es as { startMeta: { title: string; description: string } };
    expect(start.startMeta.title).toBe('Empieza a formar tu LLC en Florida');
    expect(start.startMeta.description).toMatch(/Florida/);
    expect(start.startMeta.description).not.toMatch(/\b(the|and|with|your|Form a)\b/);
    expect(start.startMeta.title).not.toMatch(/—|–/);
    expect(start.startMeta.description).not.toMatch(/—|–/);
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
      'guideFlForm',
      'guideFlAnnual',
      'guideFlReinstate',
      'guideFlRa',
      'guideLlcSinSsn',
      'guideMiamiBtr',
      'guideBrowardBtr',
      'guideLlcVsSole',
      'guideLlcApp',
      'legalDraft',
      'legalTerms',
      'legalPrivacy',
      'legalDisclaimer',
      'legalRefund',
      'stateTiming',
      'contactPage',
    ] as const;
    const messages = es as Record<string, unknown>;
    for (const name of namespaces) {
      const blob = JSON.stringify(messages[name] ?? '');
      expect(blob, name).not.toMatch(/—|–/);
    }
  });
});
