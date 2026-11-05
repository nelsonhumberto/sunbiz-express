import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asTier } from '@/lib/lp-tier';
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
    expect(page).toContain('initialTier={pickFirst(searchParams?.tier)}');
    expect(page).not.toContain("initialTier=\"STANDARD\"");
    expect(page).not.toContain("initialTier={'STANDARD'}");
    expect(page).not.toContain('initialTier="BASIC"');

    const landing = source('components/marketing/FloridaLlcLanding.tsx');
    expect(landing).toContain('useState<TierSlug>(asTier(initialTier))');
    expect(landing).toContain("void openDraft(selected, trimmed, 'hero', true)");
    expect(landing).toContain('tier,');
    expect(landing).toContain('selected === tier.slug ? \'border-primary\' : \'border-border\'');
    expect(landing).toContain("tPricing('ribbon_recommended')");
    expect(landing).toContain('tier: selected');
    expect(landing).not.toContain('highlighted || selected');
  });
});
