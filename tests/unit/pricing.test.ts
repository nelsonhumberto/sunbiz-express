import { describe, it, expect } from 'vitest';
import { computeCost } from '@/lib/pricing';

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

  it('every line item has a non-negative integer cent amount', () => {
    const r = computeCost({ ...base, tier: 'PREMIUM', addOnSlugs: ['ein'] });
    for (const line of r.lines) {
      expect(Number.isInteger(line.cents)).toBe(true);
      expect(line.cents).toBeGreaterThanOrEqual(0);
    }
  });
});
