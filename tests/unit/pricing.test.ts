import { describe, it, expect } from 'vitest';
import {
  addOnPriceCents,
  addOnPriceParts,
  computeCost,
  tierPackagePriceCents,
  tierPriceParts,
  type TierSlug,
} from '@/lib/pricing';
import { FL } from '@/lib/florida';
import { FORMATION_STATES, annualComplianceFor } from '@/lib/formation-states';

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
      { tier: 'BASIC', entity: 'LLC', service: 2_400, stateFee: 12_500 },
      { tier: 'BASIC', entity: 'CORP', service: 2_400, stateFee: 7_000 },
      { tier: 'STANDARD', entity: 'LLC', service: 11_900, stateFee: 12_500 + 500 + 3_000 },
      { tier: 'STANDARD', entity: 'CORP', service: 11_900, stateFee: 7_000 + 875 + 875 },
      { tier: 'PREMIUM', entity: 'LLC', service: 28_900, stateFee: 12_500 + 500 + 3_000 },
      { tier: 'PREMIUM', entity: 'CORP', service: 28_900, stateFee: 7_000 + 875 + 875 },
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

  it('every line item has a non-negative integer cent amount', () => {
    const r = computeCost({ ...base, tier: 'PREMIUM', addOnSlugs: ['ein'] });
    for (const line of r.lines) {
      expect(Number.isInteger(line.cents)).toBe(true);
      expect(line.cents).toBeGreaterThanOrEqual(0);
    }
  });
});
