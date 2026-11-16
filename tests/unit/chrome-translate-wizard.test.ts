import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerEnEspanolLink } from '@/components/i18n/VerEnEspanolLink';
import {
  chromeTranslateOptOut,
  englishWizardNotranslateMeta,
} from '@/lib/chrome-translate';
import { routing } from '@/i18n/routing';
import {
  VER_EN_ESPANOL,
  browserLanguageIsSpanish,
  floridaLlcSpanishPath,
  spanishOfferFor,
  spanishOfferHref,
} from '@/lib/spanish-offer';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Chrome translate opt-out', () => {
  it('sets translate="no" and notranslate on the English wizard root only', () => {
    expect(chromeTranslateOptOut('en')).toEqual({
      translate: 'no',
      className: 'notranslate',
    });
    expect(chromeTranslateOptOut('es')).toEqual({});
    expect(chromeTranslateOptOut('fr')).toEqual({});

    const layout = source('app/wizard/layout.tsx');
    expect(layout).toContain('const optOut = chromeTranslateOptOut(locale)');
    expect(layout).toContain("cn('min-h-screen bg-surface', optOut.className)");
    expect(layout).toContain('translate={optOut.translate}');
    expect(layout).not.toContain('translate="no"');
  });

  it('sends the google notranslate meta only for the English wizard', () => {
    expect(englishWizardNotranslateMeta('en')).toEqual({
      other: { google: 'notranslate' },
    });
    expect(englishWizardNotranslateMeta('es')).toEqual({});

    const layout = source('app/wizard/layout.tsx');
    expect(layout).toContain('...englishWizardNotranslateMeta(locale)');
    const landing = source('app/(marketing)/lp/florida-llc/page.tsx');
    expect(landing).not.toContain('englishWizardNotranslateMeta');
    expect(landing).not.toContain('content="notranslate"');
  });

  it('opts the English landing wizard entry out and leaves Spanish alone', () => {
    const landing = source('components/marketing/FloridaLlcLanding.tsx');
    expect(landing).toContain('const optOut = chromeTranslateOptOut(locale)');
    expect(landing).toContain("cn('pb-28', optOut.className)");
    expect(landing).toContain('translate={optOut.translate}');
    expect(landing).toContain("locale === 'en' ? (");
    expect(landing).toContain('<VerEnEspanolLink');
  });
});

describe('Ver en español', () => {
  it('appears only for es and es-* and points at a real route', () => {
    expect(VER_EN_ESPANOL).toBe('Ver en español');
    expect(VER_EN_ESPANOL).not.toMatch(/[—–]|usted\b/);

    for (const languages of [
      ['es'],
      ['es-MX'],
      ['es-ES'],
      ['es-419'],
      ['ES-mx'],
      ['es_CR'],
    ]) {
      expect(browserLanguageIsSpanish(languages), languages[0]).toBe(true);
    }
    for (const languages of [
      ['en'],
      ['en-US'],
      ['en-ES'],
      ['fr'],
      ['pt-BR'],
      ['et'],
      ['est'],
      ['en', 'es-MX'],
      [],
      undefined,
    ]) {
      expect(browserLanguageIsSpanish(languages), String(languages?.[0])).toBe(
        false,
      );
      expect(
        spanishOfferFor({ pathname: '/lp/florida-llc', languages }),
      ).toBeNull();
    }

    const lp = spanishOfferFor({
      pathname: '/lp/florida-llc',
      search: '?tier=STANDARD&utm_source=google',
      languages: ['es-MX', 'en-US'],
    });
    expect(lp).toEqual({
      href: '/es/lp/llc-florida?tier=STANDARD&utm_source=google',
      label: VER_EN_ESPANOL,
    });
    expect(routing.pathnames['/lp/florida-llc']).toEqual({
      en: '/lp/florida-llc',
      es: '/lp/llc-florida',
    });
    expect(floridaLlcSpanishPath()).toBe('/es/lp/llc-florida');
    expect(existsSync('app/(marketing)/lp/florida-llc/page.tsx')).toBe(true);

    const step = spanishOfferFor({
      pathname: '/wizard/filing_1/2',
      search: '?change=1',
      languages: ['es'],
    });
    expect(step).toEqual({
      href: '/es/wizard/filing_1/2?change=1',
      label: VER_EN_ESPANOL,
    });
    expect(existsSync('app/wizard/[filingId]/[step]/page.tsx')).toBe(true);

    expect(spanishOfferHref('/pricing', '')).toBeNull();
    expect(spanishOfferHref('/es/lp/llc-florida', '')).toBeNull();
    expect(spanishOfferHref('/es/wizard/filing_1/2', '')).toBeNull();
    expect(spanishOfferHref('/wizard', '')).toBeNull();
    expect(spanishOfferHref('/wizard/draft-email', '')).toBeNull();
    expect(spanishOfferHref('/start', '')).toBeNull();
    expect(
      spanishOfferFor({
        pathname: '/guides/florida-llc-cost',
        languages: ['es-ES'],
      }),
    ).toBeNull();
  });

  it('is absent from the server HTML so the fold does not shift', () => {
    const html = renderToStaticMarkup(
      createElement(VerEnEspanolLink, { className: 'absolute right-0 top-2' }),
    );
    expect(html).toBe('');

    const shell = source('components/wizard/WizardShell.tsx');
    expect(shell).toContain('relative flex-1 container py-8 lg:py-12');
    expect(shell).toContain("locale === 'en' ? (");
    expect(shell).toContain('absolute right-4 top-2');
    expect(shell).toContain('<VerEnEspanolLink');
    const link = source('components/i18n/VerEnEspanolLink.tsx');
    expect(link).toContain('Ver en español');
    expect(link).not.toContain('trackEvent');
    expect(link).not.toContain('router.push');
  });
});
