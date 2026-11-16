import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import { cookieNoticeLocale } from '@/lib/cookie-notice-locale';
import { NAME_CHECK_IP_LIMIT, NAME_CHECK_IP_WINDOW_MS } from '@/lib/name-check';
import { installTranslateDomGuard, TRANSLATE_DOM_GUARD_SCRIPT } from '@/lib/translate-dom-guard';
import { wizardRenderFailureContext } from '@/lib/wizard-error-context';

const GUIDE_FAQ: Record<string, number> = {
  guideFlForm: 3,
  guideFlAnnual: 3,
  guideFlRa: 3,
  guideFlCorp: 7,
  guideOa: 7,
};

describe('cookie notice follows the public path', () => {
  it('uses Spanish on /es even when the request locale is English', () => {
    expect(cookieNoticeLocale('/es', 'en')).toBe('es');
    expect(cookieNoticeLocale('/es/lp/llc-florida', 'en')).toBe('es');
    expect(cookieNoticeLocale('/lp/florida-llc', 'es')).toBe('en');
    expect(cookieNoticeLocale('', 'es')).toBe('es');
    expect(es.cookieNotice.body).toBe('Usamos cookies para mejorar tu visita.');
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout).toContain('cookieNoticeLocale');
    expect(layout).toContain('<CookieConsentBar locale={locale} copy={cookieCopy} />');
    const bar = readFileSync('components/analytics/CookieConsentBar.tsx', 'utf8');
    expect(bar).not.toContain('useLocale');
    expect(bar).toContain('copy.body');
  });
});

describe('wizard translate guard and error recovery', () => {
  it('ships the React #11538 guard before hydration and logs translate signals', () => {
    expect(TRANSLATE_DOM_GUARD_SCRIPT).toContain('removeChild');
    expect(TRANSLATE_DOM_GUARD_SCRIPT).toContain('insertBefore');
    expect(TRANSLATE_DOM_GUARD_SCRIPT).toContain('parentNode');
    const layout = readFileSync('app/layout.tsx', 'utf8');
    expect(layout.indexOf('id="lf-translate-dom-guard"')).toBeLessThan(
      layout.indexOf('id="strip-li-fat-id"'),
    );
    expect(layout).toContain('strategy="beforeInteractive"');
    const wizardLayout = readFileSync('app/wizard/layout.tsx', 'utf8');
    expect(wizardLayout).not.toContain('translate=');
    expect(wizardRenderFailureContext({
      digest: 'abc',
      language: 'es-MX',
      htmlClassName: 'translated-ltr other',
    })).toEqual({
      digest: 'abc',
      tag: 'wizard-error-boundary',
      language: 'es-MX',
      translated: true,
    });
    expect(wizardRenderFailureContext({ htmlClassName: 'translated-rtl' }).translated).toBe(true);
    expect(wizardRenderFailureContext({ htmlClassName: '' }).translated).toBe(false);
    const errorPage = readFileSync('app/wizard/error.tsx', 'utf8');
    expect(errorPage).toContain('navigator.language');
    expect(errorPage).toContain('window.location.reload()');
    expect(errorPage).toContain('wizardRenderFailureContext');
  });

  it('no-ops removeChild and insertBefore when Translate reparents the node', () => {
    const removed: string[] = [];
    const inserted: string[] = [];
    const parent = {
      parentNode: null,
      removeChild(child: { parentNode: unknown }) {
        removed.push('native');
        return child;
      },
      insertBefore(node: { parentNode: unknown }, _ref: unknown) {
        inserted.push('native');
        return node;
      },
    };
    const child = { parentNode: { not: parent } };
    installTranslateDomGuard(parent as unknown as Parameters<typeof installTranslateDomGuard>[0]);
    expect(parent.removeChild(child)).toBe(child);
    expect(removed).toEqual([]);
    const fresh = { parentNode: null };
    expect(parent.insertBefore(fresh, child)).toBe(fresh);
    expect(inserted).toEqual([]);
    const own = { parentNode: parent };
    expect(parent.removeChild(own)).toBe(own);
    expect(removed).toEqual(['native']);
  });
});

describe('name check rate limit and short viewports', () => {
  it('allows more than 15 lookups per minute per visitor', () => {
    expect(NAME_CHECK_IP_LIMIT).toBeGreaterThan(15);
    expect(NAME_CHECK_IP_LIMIT).toBe(60);
    expect(NAME_CHECK_IP_WINDOW_MS).toBe(60_000);
    expect(readFileSync('app/api/sunbiz/name-check/route.ts', 'utf8')).toContain('NAME_CHECK_IP_LIMIT');
  });

  it('keeps the business name above the sticky bar around a 664px-tall screen', () => {
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toContain('.wizard-name-block');
    expect(css).toContain('scroll-margin-bottom');
    expect(css).toContain('@media (max-height: 720px)');
    expect(css).toContain('.wizard-step-intro');
    const widget = readFileSync('components/wizard/NameCheckWidget.tsx', 'utf8');
    expect(widget).toContain('wizard-name-block');
    expect(widget).toContain('id="businessName"');
  });
});

describe('guide FAQ keys exist in English and Spanish', () => {
  it('resolves every faq lookup the guide pages make', () => {
    const catalogs = { en, es } as const;
    for (const [namespace, count] of Object.entries(GUIDE_FAQ)) {
      for (const locale of ['en', 'es'] as const) {
        const bag = catalogs[locale][namespace as keyof typeof catalogs.en] as Record<string, string>;
        expect(bag, `${locale} ${namespace}`).toBeTruthy();
        for (let n = 1; n <= count; n += 1) {
          expect(bag[`faq${n}q`], `${locale} ${namespace}.faq${n}q`).toEqual(expect.any(String));
          expect(bag[`faq${n}a`], `${locale} ${namespace}.faq${n}a`).toEqual(expect.any(String));
          expect(bag[`faq${n}q`]).not.toMatch(/\u2014/);
          expect(bag[`faq${n}a`]).not.toMatch(/\u2014/);
        }
      }
    }
    expect(en.guideFlCorp.faqHeading).toBe('FAQ');
    expect(es.guideFlCorp.faqHeading).toBe('Preguntas frecuentes');
    expect(en.guideOa.faqHeading).toBe('FAQ');
    expect(es.guideOa.faqHeading).toBe('Preguntas frecuentes');
    const guide = readFileSync('components/marketing/SpanishGuide.tsx', 'utf8');
    expect(guide).toContain("getTranslations({ locale: 'es', namespace })");
  });
});

describe('Delaware and Wyoming wizard copy', () => {
  it('is translated, informal, and free of em dashes', () => {
    const keys = [
      'deMembersTitle',
      'deMembersBody',
      'wyOrganizerEmail',
      'wyOrganizerHelp',
      'wyConsent',
      'wyNameDeferred',
      'wyDistinguishable',
      'procSpeedTitle',
      'foreignOperateBody',
    ] as const;
    for (const key of keys) {
      expect(es.wizard[key].length).toBeGreaterThan(0);
      expect(es.wizard[key]).not.toMatch(/\u2014|\u2013/);
      expect(en.wizard[key]).not.toMatch(/\u2014/);
    }
    expect(es.wizard.wyConsent).toMatch(/Acepto/);
    expect(es.wizard.deMembersBody).toMatch(/\bte\b/i);
    expect(es.wizard.wyOrganizerEmail).not.toMatch(/\b(el organizador|la organizadora)\b/i);
    const step7 = readFileSync('components/wizard/steps/Step7Members.tsx', 'utf8');
    expect(step7).not.toContain('Delaware Certificate - initial member disclosure');
    expect(step7).toContain("t('deMembersTitle')");
    const step9 = readFileSync('components/wizard/steps/Step9Optional.tsx', 'utf8');
    expect(step9).toContain("t('wyOrganizerEmail')");
    expect(step9).not.toContain('Organizer email');
  });
});
