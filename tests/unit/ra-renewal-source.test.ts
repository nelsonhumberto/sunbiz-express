import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORMATION_STATES } from '@/lib/formation-states';
import {
  RA_ANNUAL_SERVICE_FEE_CENTS,
  RA_RENEWAL_PRICE_CENTS,
  TIERS,
} from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { ALL_MARKETING_STATES, FLORIDA } from '@/lib/marketing-states';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const price = formatCurrency(RA_RENEWAL_PRICE_CENTS);

describe('registered agent renewal price source', () => {
  it('is $150 in Florida, $119 in Wyoming, and $149 in Delaware', () => {
    expect(RA_RENEWAL_PRICE_CENTS).toBe(15_000);
    expect(RA_ANNUAL_SERVICE_FEE_CENTS).toBe(RA_RENEWAL_PRICE_CENTS);
    expect(price).toBe('$150');
    expect(FORMATION_STATES.FL.registeredAgent.renewalCents).toBe(15_000);
    expect(FORMATION_STATES.WY.registeredAgent.renewalCents).toBe(11_900);
    expect(FORMATION_STATES.DE.registeredAgent.renewalCents).toBe(14_900);
    const states = readFileSync('lib/formation-states.ts', 'utf8');
    expect(states).toContain("from './ra-renewal-price'");
    expect(states).toContain('renewalCents: RA_RENEWAL_PRICE_CENTS');
    expect(states).toContain('renewalCents: 11_900');
    expect(states).toContain('renewalCents: 14_900');
    expect(states).not.toContain('bindRaRenewalPriceCents');
    const pricing = readFileSync('lib/pricing.ts', 'utf8');
    expect(pricing).toContain('export { RA_RENEWAL_PRICE_CENTS }');
    expect(pricing).not.toContain('bindRaRenewalPriceCents');
    expect(readFileSync('lib/ra-renewal-price.ts', 'utf8')).toContain(
      'export const RA_RENEWAL_PRICE_CENTS = 15_000',
    );
  });

  it('interpolates the catalog price instead of hard-coding it in customer copy', () => {
    const keys = [
      [en.dashboard.raRenewalPrice, es.dashboard.raRenewalPrice],
      [en.addCompany.raUpsellBody, es.addCompany.raUpsellBody],
      [en.filingDetail.nonUsRaBody, es.filingDetail.nonUsRaBody],
      [en.wizard.useOurAgentP3, es.wizard.useOurAgentP3],
      [en.wizard.ownAgentConfirmBenefit2, es.wizard.ownAgentConfirmBenefit2],
      [en.annualReportHome.raBody, es.annualReportHome.raBody],
    ] as const;
    for (const [english, spanish] of keys) {
      expect(english).toContain('{price}');
      expect(spanish).toContain('{price}');
      expect(english).not.toMatch(/\$150|\$119|\$149/);
      expect(spanish).not.toMatch(/\$150|\$119|\$149/);
    }
    expect(es.guideWyDe.body).toContain('dirección física en Wyoming');
    expect(es.guideWyDe.body).toContain('dirección física en Delaware');
    expect(es.guideWyDe.body).not.toContain('$150');
    expect(es.guideWyDe.body).not.toMatch(/\{wyPrice\}|\{dePrice\}|\{price\}/);

    const faqEn = getMarketingFaq(FLORIDA, 'en').map((item) => item.a).join('\n');
    const faqEs = getMarketingFaq(FLORIDA, 'es').map((item) => item.a).join('\n');
    expect(faqEn).toContain(`${price}/year`);
    expect(faqEs).toContain(`${price}/año`);
    expect(faqEn).not.toMatch(/\$119|\$149\b/);
    const wyoming = ALL_MARKETING_STATES.find((state) => state.code === 'WY')!;
    const delaware = ALL_MARKETING_STATES.find((state) => state.code === 'DE')!;
    expect(wyoming.availability).toBe('inactive');
    expect(delaware.availability).toBe('inactive');
    expect(getMarketingFaq(wyoming, 'en').map((item) => item.a).join('\n')).toContain(`${price}/year`);
    expect(getMarketingFaq(delaware, 'es').map((item) => item.a).join('\n')).toContain(`${price}/año`);
    const faqSource = readFileSync('lib/marketing-faq.ts', 'utf8');
    expect(faqSource).toContain('renewal is ${WY_RA_PRICE}/year');
    expect(faqSource).toContain('la renovación es ${DE_RA_PRICE}/año');
    const guide = readFileSync('app/(marketing)/guides/wyoming-llc-vs-delaware-corp/page.tsx', 'utf8');
    expect(guide).toContain('must have a Wyoming physical address');
    expect(guide).toContain('must have a Delaware physical address');
    expect(guide).not.toContain('RA_RENEWAL_PRICE');
    expect(guide).not.toContain('$150/year');

    const facts = readFileSync('lib/assistant/docs.ts', 'utf8');
    const knowledge = readFileSync('lib/assistant/knowledge.ts', 'utf8');
    expect(facts).toContain('{raRenewalPrice}');
    expect(facts).not.toMatch(/\$150|\$119/);
    expect(knowledge).toContain('registeredAgent.renewalCents');
    expect(knowledge).not.toContain('RA_RENEWAL_PRICE_CENTS');
    expect(readFileSync('lib/ra-renewal-price.ts', 'utf8')).toContain(
      'return renewalPriceCents ?? RA_RENEWAL_PRICE_CENTS',
    );
    expect(readFileSync('lib/post-formation-email.ts', 'utf8')).toContain(
      'formatRaRenewalPrice(args.renewalPriceCents)',
    );
    expect(readFileSync('lib/email-mock.ts', 'utf8')).not.toContain('$149');
    expect(readFileSync('lib/email-mock.ts', 'utf8')).toContain('formatRaRenewalPrice(renewalPriceCents)');
    expect(readFileSync('lib/email.ts', 'utf8')).toContain('formatRaRenewalPrice(ctx.raRenewalPriceCents)');
    expect(readFileSync('lib/email.ts', 'utf8')).toContain('formatCurrency(totalCents)');
  });
});

describe('pricing feature accuracy', () => {
  it('does not list Annual Compliance Service on a package that does not include it', () => {
    for (const tier of TIERS) {
      expect(tier.features.some((feature) => feature.label === 'Annual Compliance Service')).toBe(false);
    }
    const premium = TIERS.find((tier) => tier.slug === 'PREMIUM');
    expect(premium?.features.some((feature) => feature.label === 'Compliance Alerts Plus (year 1)' && feature.included)).toBe(true);
    expect(readFileSync('components/marketing/PricingTable.tsx', 'utf8')).not.toContain('Annual Compliance Service');
    expect(readFileSync('messages/en.json', 'utf8')).not.toContain('Annual Compliance Service');
    expect(readFileSync('messages/es.json', 'utf8')).not.toContain('Servicio Anual de Cumplimiento');
  });
});

describe('wizard step 1 selected card', () => {
  it('keeps the selected check icon out of the row so S-Corp does not widen the page', () => {
    const step = readFileSync('components/wizard/steps/Step1Entity.tsx', 'utf8');
    expect(step).toContain('grid min-w-0 grid-cols-3');
    expect(step).toContain('relative min-w-0');
    expect(step).toContain('min-w-0 break-words');
    expect(step).toMatch(/<Check[\s\S]*absolute right-1 top-2/);
    expect(step).not.toContain('ml-auto shrink-0');
  });
});
