import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  addOnPriceCents,
  addOnPriceParts,
  computeCost,
  TIER_BY_SLUG,
  tierBundledAddOns,
  tierPackagePriceCents,
  tierPriceParts,
  type TierSlug,
} from '@/lib/pricing';
import { buildKnowledge } from '@/lib/assistant/knowledge';
import { FL } from '@/lib/florida';
import { FORMATION_STATES, annualComplianceFor } from '@/lib/formation-states';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

describe('computeCost', () => {
  const base = { entityType: 'LLC' as const, state: 'FL' as const };

  it('returns a positive total with line items', () => {
    const r = computeCost({ ...base, tier: 'STANDARD', addOnSlugs: [] });
    expect(r.totalCents).toBeGreaterThan(0);
    expect(Array.isArray(r.lines)).toBe(true);
    expect(r.lines.length).toBeGreaterThan(0);
  });

  it('Premium costs at least as much as Basic', () => {
    const basic = computeCost({ ...base, tier: 'BASIC', addOnSlugs: [] });
    const premium = computeCost({ ...base, tier: 'PREMIUM', addOnSlugs: [] });
    expect(premium.totalCents).toBeGreaterThanOrEqual(basic.totalCents);
  });

  it('adding an unbundled add-on never lowers the total', () => {
    const without = computeCost({ ...base, tier: 'BASIC', addOnSlugs: [] });
    const withEin = computeCost({ ...base, tier: 'BASIC', addOnSlugs: ['ein'] });
    expect(withEin.totalCents).toBeGreaterThanOrEqual(without.totalCents);
  });

  it('itemizes each Florida tier as service fee plus state fee without changing the total', () => {
    const cases: { tier: TierSlug; entity: 'LLC' | 'CORP'; service: number; stateFee: number }[] = [
      { tier: 'BASIC', entity: 'LLC', service: 7_400, stateFee: 12_500 },
      { tier: 'BASIC', entity: 'CORP', service: 7_400, stateFee: 7_000 },
      { tier: 'STANDARD', entity: 'LLC', service: 18_900, stateFee: 12_500 + 500 + 3_000 },
      { tier: 'STANDARD', entity: 'CORP', service: 18_900, stateFee: 7_000 + 875 + 875 },
      { tier: 'PREMIUM', entity: 'LLC', service: 38_900, stateFee: 12_500 + 500 + 3_000 },
      { tier: 'PREMIUM', entity: 'CORP', service: 38_900, stateFee: 7_000 + 875 + 875 },
    ];
    for (const row of cases) {
      const parts = tierPriceParts(row.tier, row.entity, 'FL');
      expect(parts.serviceCents).toBe(row.service);
      expect(parts.stateFeeCents).toBe(row.stateFee);
      expect(parts.totalCents).toBe(row.service + row.stateFee);
      expect(parts.totalCents).toBe(tierPackagePriceCents(row.tier, row.entity, 'FL'));
    }
  });

  it('itemizes certificate add-ons and leaves service-only add-ons with a zero state fee', () => {
    const cert = addOnPriceParts('cert_status', 'LLC', 'FL');
    expect(cert.stateFeeCents).toBe(500);
    expect(cert.totalCents).toBe(addOnPriceCents('cert_status', 'LLC', 'FL'));
    const agreement = addOnPriceParts('operating_agreement_single', 'LLC', 'FL');
    expect(agreement.stateFeeCents).toBe(0);
    expect(agreement.totalCents).toBe(addOnPriceCents('operating_agreement_single', 'LLC', 'FL'));
  });

  it('labels Florida annual compliance fees as $138.75 for an LLC and $150 for a corporation', () => {
    expect(FL.fees.annualReportLLC).toBe(13_875);
    expect(FL.fees.annualReportCorp).toBe(15_000);
    const rule = FORMATION_STATES.FL;
    expect(annualComplianceFor(rule, 'LLC').baseFeeCents).toBe(13_875);
    expect(annualComplianceFor(rule, 'CORP').baseFeeCents).toBe(15_000);
    expect(annualComplianceFor(rule, 'LLC').entityType).toBe('LLC');
    expect(annualComplianceFor(rule, 'CORP').entityType).toBe('CORP');
  });

  it('lists a free .com domain only on Premium', () => {
    const labels = (tier: TierSlug) => TIER_BY_SLUG[tier].features.map((feature) => feature.label);
    expect(labels('BASIC').some((label) => /domain/i.test(label))).toBe(false);
    expect(labels('STANDARD').some((label) => /domain/i.test(label))).toBe(false);
    expect(TIER_BY_SLUG.PREMIUM.features).toContainEqual({
      label: 'Free .com domain (year 1)',
      included: true,
      highlight: true,
    });
    expect(tierBundledAddOns('BASIC')).not.toContain('domain_com');
    expect(tierBundledAddOns('STANDARD')).not.toContain('domain_com');
    expect(tierBundledAddOns('PREMIUM')).toContain('domain_com');
    for (const tier of ['BASIC', 'STANDARD'] as const) {
      const without = computeCost({ ...base, tier, addOnSlugs: [] });
      const withDomain = computeCost({ ...base, tier, addOnSlugs: ['domain_com'] });
      expect(withDomain.totalCents - without.totalCents).toBe(addOnPriceCents('domain_com', 'LLC', 'FL'));
      expect(without.totalCents).toBe(tierPackagePriceCents(tier, 'LLC', 'FL'));
    }
    const premium = computeCost({ ...base, tier: 'PREMIUM', addOnSlugs: ['domain_com'] });
    expect(premium.totalCents).toBe(tierPackagePriceCents('PREMIUM', 'LLC', 'FL'));
  });

  it('badges Popular as Recommended in English and Spanish', () => {
    expect(TIER_BY_SLUG.STANDARD.recommended).toBe(true);
    expect(TIER_BY_SLUG.STANDARD.ribbon).toBe('Recommended');
    expect(TIER_BY_SLUG.BASIC.ribbon).toBeUndefined();
    expect(en.pricing.ribbon_recommended).toBe('Recommended');
    expect(es.pricing.ribbon_recommended).toBe('Recomendado');
    expect(en.pricing.ribbon_recommended.toLowerCase()).not.toContain('most popular');
    expect(es.pricing.ribbon_recommended.toLowerCase()).not.toContain('más popular');
    expect(en.pricing.feat_domainConcierge).toBe('Free .com domain (year 1)');
    expect(es.pricing.feat_domainConcierge).toBe('Dominio .com gratis (año 1)');
    expect(en.pricing).not.toHaveProperty('feat_domain');
    expect(es.pricing).not.toHaveProperty('feat_domain');

    const i18n = readFileSync('lib/pricing-i18n.ts', 'utf8');
    const table = readFileSync('components/marketing/PricingTable.tsx', 'utf8');
    const picker = readFileSync('components/wizard/steps/Step3Tier.tsx', 'utf8');
    expect(i18n).not.toContain("'Free .com domain':");
    expect(i18n).toContain("'Free .com domain (year 1)': 'feat_domainConcierge'");
    expect(table.replaceAll('feat_domainConcierge', '')).not.toContain('feat_domain');
    expect(table).toContain('feat_domainConcierge');
    expect(table).toContain("t('ribbon_recommended')");
    expect(picker).toContain("t('ribbon_recommended')");
    expect(table).not.toMatch(/most popular/i);
    expect(picker).not.toMatch(/most popular/i);
  });

  it('tells the assistant that only Premium includes a domain', () => {
    const text = buildKnowledge({ stateCode: 'FL', entityType: 'LLC', locale: 'en' });
    const line = (name: string) => text.split('\n').find((row) => row.startsWith(`- ${name} `));
    expect(line('Essential')).toBeTruthy();
    expect(line('Popular')).toBeTruthy();
    expect(line('Essential')).not.toMatch(/domain/i);
    expect(line('Popular')).not.toMatch(/domain/i);
    expect(line('Premium')).toContain('Free .com domain (year 1)');
    expect(text).toContain(
      'A free .com domain (year 1) is included only with Premium. Essential and Popular do not include a domain.',
    );
    const domainSentence = text
      .split('\n')
      .find((row) => row.startsWith('A free .com domain (year 1)'));
    expect(domainSentence).not.toMatch(/[—–]/);
  });

  it('every line item has a non-negative integer cent amount', () => {
    const r = computeCost({ ...base, tier: 'PREMIUM', addOnSlugs: ['ein'] });
    for (const line of r.lines) {
      expect(Number.isInteger(line.cents)).toBe(true);
      expect(line.cents).toBeGreaterThanOrEqual(0);
    }
  });
});
