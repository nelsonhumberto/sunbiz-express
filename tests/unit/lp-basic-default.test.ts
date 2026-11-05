import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asTier, tierFromLandingSearch } from '@/lib/lp-tier';
import { routing } from '@/i18n/routing';
import { tierPackagePriceCents } from '@/lib/pricing';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Florida LLC landing defaults to Basic', () => {
  it('opens a Basic draft in English and Spanish unless ?tier= is valid', () => {
    expect(asTier(undefined)).toBe('BASIC');
    expect(asTier('')).toBe('BASIC');
    expect(asTier('nope')).toBe('BASIC');
    expect(asTier('basic')).toBe('BASIC');
    expect(asTier('standard')).toBe('STANDARD');
    expect(asTier('PREMIUM')).toBe('PREMIUM');
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(19_900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(34_900);

    expect(routing.pathnames['/lp/florida-llc']).toEqual({
      en: '/lp/florida-llc',
      es: '/lp/llc-florida',
    });
    const page = source('app/(marketing)/lp/florida-llc/page.tsx');
    expect(page).toContain('landingTier(searchParams, headers().get(\'x-lf-search\'))');
    expect(page).toContain('tierFromLandingSearch');
    expect(page).not.toContain("initialTier=\"STANDARD\"");
    expect(page).not.toContain("initialTier={'STANDARD'}");
    expect(page).not.toContain('initialTier="BASIC"');
    const middleware = source('middleware.ts');
    expect(middleware).toContain("requestHeaders.set('x-lf-search', request.nextUrl.search)");
    expect(middleware).toContain("pathname === '/lp/florida-llc'");

    const landing = source('components/marketing/FloridaLlcLanding.tsx');
    expect(landing).toContain('landingStartTier({');
    expect(landing).toContain('window.location.search');
    expect(landing).toContain('name="tier"');
    expect(landing).toContain("void openDraft(tier, trimmed, 'hero', true)");
    expect(landing).toContain('tier,');
    expect(landing).toContain('selected === tier.slug ? \'border-primary\' : \'border-border\'');
    expect(landing).toContain("tPricing('ribbon_recommended')");
    expect(landing).not.toContain('highlighted || selected');
  });

  it('keeps tier=STANDARD on the English ad URL that also has utm params', () => {
    const search = '?utm_source=google&utm_medium=cpc&utm_campaign=qa_pr103&tier=STANDARD';
    expect(tierFromLandingSearch(search)).toBe('STANDARD');
    expect(asTier(tierFromLandingSearch(search))).toBe('STANDARD');
    expect(tierPackagePriceCents(asTier(tierFromLandingSearch(search)), 'LLC', 'FL')).toBe(34_900);
    expect(asTier(tierFromLandingSearch('?tier=STANDARD'))).toBe('STANDARD');
    expect(asTier(tierFromLandingSearch(''))).toBe('BASIC');
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(19_900);
  });
});
