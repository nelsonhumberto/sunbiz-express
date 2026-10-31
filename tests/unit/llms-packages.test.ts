import { describe, expect, it } from 'vitest';
import { buildLlmsTxt } from '@/lib/llms';
import { TIERS, tierBundledAddOns, tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

describe('llms.txt packages', () => {
  const text = buildLlmsTxt();
  const lines = text.split('\n');

  it('lists each Florida LLC package from the catalog, and only Premium includes the domain', () => {
    expect(text).toContain('## Packages');
    expect(text).toContain('Only Premium includes a .com domain.');
    expect(text).not.toContain('$299');
    expect(text).not.toMatch(/Launch Bundle/);
    expect(text).not.toMatch(/—|–/);
    expect(text).toContain('/guides/how-long-to-form-florida-llc');

    for (const tier of TIERS) {
      const price = formatCurrency(tierPriceParts(tier.slug, 'LLC', 'FL').totalCents);
      const line = lines.find((entry) => entry.startsWith(`- ${tier.name} (${price}):`));
      expect(line, tier.name).toBeTruthy();
      expect(line).toContain('State filing fee included');
      expect(line).toContain('Free Year-1 Registered Agent');
      const hasDomain = tierBundledAddOns(tier.slug).includes('domain_com');
      if (hasDomain) {
        expect(line).toContain('Free .com domain (year 1)');
      } else {
        expect(line).not.toContain('domain');
      }
    }

    expect(formatCurrency(tierPriceParts('BASIC', 'LLC', 'FL').totalCents)).toBe('$199');
    expect(formatCurrency(tierPriceParts('STANDARD', 'LLC', 'FL').totalCents)).toBe('$349');
    expect(formatCurrency(tierPriceParts('PREMIUM', 'LLC', 'FL').totalCents)).toBe('$549');
    expect(
      TIERS.filter((tier) => tierBundledAddOns(tier.slug).includes('domain_com')).map(
        (tier) => tier.name,
      ),
    ).toEqual(['Premium']);
  });
});
