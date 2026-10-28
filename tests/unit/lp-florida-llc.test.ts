import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { routing } from '@/i18n/routing';
import { toSpanishUrl } from '@/lib/locale-paths';
import { localeAlternates } from '@/lib/locale-seo';
import { tierPackagePriceCents } from '@/lib/pricing';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Florida LLC ad landing', () => {
  it('pairs the English and Spanish URLs and keeps them out of the sitemap', () => {
    expect(routing.pathnames['/lp/florida-llc']).toEqual({
      en: '/lp/florida-llc',
      es: '/lp/llc-florida',
    });
    expect(toSpanishUrl('/lp/florida-llc?utm_source=google&gclid=abc')).toBe(
      '/es/lp/llc-florida?utm_source=google&gclid=abc',
    );
    const alternates = localeAlternates('/lp/florida-llc', '/es/lp/llc-florida');
    expect(alternates.canonical).toBe('/es/lp/llc-florida');
    expect(alternates.languages).toEqual({
      en: '/lp/florida-llc',
      es: '/es/lp/llc-florida',
      'x-default': '/lp/florida-llc',
    });
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes('/lp/'))).toBe(false);
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    for (const rule of list) {
      const disallow = rule.disallow;
      const paths = Array.isArray(disallow) ? disallow : [disallow];
      expect(paths).not.toContain('/lp/');
      expect(paths).not.toContain('/es/lp/');
    }
  });

  it('noindexes the page and reuses existing claims, with the price from the catalog', () => {
    const page = source('app/(marketing)/lp/florida-llc/page.tsx');
    const landing = source('components/marketing/FloridaLlcLanding.tsx');
    expect(page).toContain('index: false');
    expect(page).toContain("withLocaleMeta(\n    '/lp/florida-llc'");
    expect(page).toContain('floridaOnlyNote');
    expect(page).toContain("tDisc('notAffiliated')");
    expect(landing).toContain('tierPackagePriceCents');
    expect(landing).not.toMatch(/\$199/);
    expect(landing).toContain("tPricing('feat_sameDay')");
    expect(page).toContain("tHero('previewBankReadyDetail')");
    expect(landing).toContain("tPricing('allIn')");
    expect(landing).toContain("tPricing('serviceGuarantee')");
    expect(landing).toContain('trackGoogleBeginFiling');
    expect(landing).toContain('hrefWithAttribution');
    expect(landing).toContain('openGuestDraft');
    expect(landing.indexOf('data-testid="lp-hero"')).toBeLessThan(landing.indexOf('data-testid="lp-plans"'));
    expect(landing.indexOf('data-testid="lp-cta"')).toBeLessThan(landing.indexOf('data-testid="lp-plans"'));
    expect(en.pricing.feat_sameDay).toBe('Filing within 1 business day');
    expect(es.pricing.feat_sameDay).toBe('Presentación en 1 día hábil');
    expect(en.hero.previewBankReadyDetail).toBe('Florida filing fee included');
    expect(es.hero.previewBankReadyDetail).toBe('Tarifa estatal de Florida incluida');
    expect(en.pricing.serviceGuarantee).not.toMatch(/[—–]/);
    expect(es.pricing.feeDetails).not.toMatch(/[—–]/);
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(19_900);
  });

  it('keeps the pricing choose control a link and does not shift it on touch', () => {
    const table = source('components/marketing/PricingTable.tsx');
    expect(table).toContain('aria-expanded={open}');
    expect(table).toContain('aria-controls={detailsId}');
    expect(table).toContain('hrefWithAttribution');
    expect(table).toContain('`/start?tier=${tier.slug}');
    expect(table.replaceAll('[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1', '')).not.toContain(
      'hover:-translate-y-1',
    );
    expect(table).toContain('active:scale-100');
    expect(table).toContain('touch-manipulation');
    expect(table).toContain("trackCtaClicked('pricing_choose'");
    expect(table).toContain("location: 'pricing'");
    const start = source('app/start/page.tsx');
    const launch = source('app/start/guest-start-launch.tsx');
    expect(start.indexOf('<GuestStartLaunch')).toBeLessThan(start.indexOf('<GovDisclosure'));
    expect(launch).toContain('data-testid="start-value"');
    expect(launch).toContain('tierPackagePriceCents');
    expect(launch).toContain('trackGoogleBeginFiling');
  });
});
