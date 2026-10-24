import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIER_BY_SLUG } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

describe('business services mobile hero', () => {
  it('uses the lowest tier price from pricing.ts and matches the ad offer', () => {
    expect(TIER_BY_SLUG.BASIC.packagePriceCents).toBe(14_900);
    const price = formatCurrency(TIER_BY_SLUG.BASIC.packagePriceCents);
    expect(price).toBe('$149');

    expect(en.businessServices.headline).toBe('Compliance deadlines handled. Plans from {price}.');
    expect(es.businessServices.headline).toBe('Plazos de cumplimiento resueltos. Planes desde {price}.');
    expect(en.businessServices.primaryCta).toBe('Get started');
    expect(es.businessServices.primaryCta).toBe('Empezar');
    expect(`${en.businessServices.headline} ${es.businessServices.headline}`).not.toMatch(/—|–/);

    const page = readFileSync('app/(compliance-landing)/business-services/page.tsx', 'utf8');
    expect(page).toContain('TIER_BY_SLUG.BASIC.packagePriceCents');
    expect(page).toContain("t('headline', { price: plansFrom })");
    expect(page).not.toContain('$149');

    const cta = readFileSync('components/marketing/BusinessServicesHeroCta.tsx', 'utf8');
    expect(cta).toContain('href="#request"');
    expect(cta).toContain('data-testid="business-services-primary-cta"');
  });
});
