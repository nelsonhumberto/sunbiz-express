import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_REPORT_SERVICE_FEE_CENTS,
  RA_RENEWAL_PRICE_CENTS,
  TIER_BY_SLUG,
  tierPackagePriceCents,
  tierPriceParts,
} from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const essential = formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL'));
const popular = formatCurrency(tierPackagePriceCents('STANDARD', 'LLC', 'FL'));
const premium = formatCurrency(tierPackagePriceCents('PREMIUM', 'LLC', 'FL'));
const corp = tierPriceParts('BASIC', 'CORP', 'FL');
const corpAllIn = formatCurrency(corp.totalCents);
const corpService = formatCurrency(corp.serviceCents);
const corpStateFee = formatCurrency(corp.stateFeeCents);
const stateFee = formatCurrency(tierPriceParts('BASIC', 'LLC', 'FL').stateFeeCents);
const annualService = formatCurrency(ANNUAL_REPORT_SERVICE_FEE_CENTS);

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('displayed prices derive from lib/pricing.ts', () => {
  it('uses the Oct 25, 2026 Florida LLC all-in totals and the $99 annual-report service fee', () => {
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(19_900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(34_900);
    expect(tierPackagePriceCents('PREMIUM', 'LLC', 'FL')).toBe(54_900);
    expect(TIER_BY_SLUG.BASIC.serviceMarginCents).toBe(7_400);
    expect(TIER_BY_SLUG.STANDARD.serviceMarginCents).toBe(18_900);
    expect(TIER_BY_SLUG.PREMIUM.serviceMarginCents).toBe(38_900);
    expect(essential).toBe('$199');
    expect(popular).toBe('$349');
    expect(premium).toBe('$549');
    expect(corpAllIn).toBe('$144');
    expect(corpService).toBe('$74');
    expect(stateFee).toBe('$125');
    expect(ANNUAL_REPORT_SERVICE_FEE_CENTS).toBe(9_900);
    expect(annualService).toBe('$99');
    expect(RA_RENEWAL_PRICE_CENTS).toBe(15_000);
  });

  it('keeps English and Spanish catalog copy on those catalog prices', () => {
    expect(en.howItWorks.step2Body).toBe(
      `Essential (${essential}), Popular (${popular}), or Premium (${premium}). Florida filing fee already included.`,
    );
    expect(es.howItWorks.step2Body).toBe(
      `Esencial (${essential}), Popular (${popular}) o Premium (${premium}). Tarifa estatal de Florida ya incluida.`,
    );
    expect(en.howItWorks.step2Dynamic).toContain('{basicPrice}');
    expect(en.howItWorks.step2Dynamic).not.toMatch(/\$149|\$279|\$449/);
    expect(es.pricingMeta.descFl).toContain(`desde ${essential} todo incluido`);
    expect(es.guideOa.ctaBody).toContain(`(${popular} todo incluido`);
    expect(es.guideFlCorp.body).toContain(
      `empiezan en ${corpAllIn} todo incluido (tarifa de servicio ${corpService} + tarifa estatal de Florida ${corpStateFee})`,
    );
    expect(en.nicheStylists.metaTitle).toContain(essential);
    expect(en.nicheStylists.essentialBody).toContain(`Essential is ${essential}`);
    expect(en.nicheStylists.essentialBody).toContain(stateFee);
    expect(en.nicheStylists.faq6q).toBe(`What does ${essential} include?`);
    expect(es.nicheStylists.ctaLabel).toBe(`Empezar mi LLC por ${essential}`);
    expect(es.nicheStylists.faq6q).toBe(`¿Qué incluyen los ${essential}?`);
    expect(es.nicheStylists.essentialBody).toContain(`Esencial cuesta ${essential}`);
    // The Launch Bundle product is not on main. This is only a copy reference.
    expect(en.nicheStylists.bundleTitle).toBe('Launch Bundle, $299 for our first 10 customers');
    expect(source('lib/pricing.ts')).not.toContain('LAUNCH_BUNDLE_PRICE_CENTS');
  });

  it('builds page, guide, and llms sentences from the catalog instead of old literals', () => {
    const pricing = source('app/(marketing)/pricing/page.tsx');
    expect(pricing).toContain("tierPackagePriceCents('BASIC', 'LLC', 'FL')");
    expect(pricing).toContain('pricingProductJsonLd');
    expect(pricing).toContain('${FL_LLC_FROM}');
    expect(pricing).not.toMatch(/\$149|\$279|\$449/);

    const corpPage = source('app/(marketing)/guides/how-to-form-a-florida-corporation/page.tsx');
    expect(corpPage).toContain("tierPriceParts('BASIC', 'CORP', 'FL')");
    expect(corpPage).toContain('formatCurrency(CORP_ESSENTIAL.totalCents)');
    expect(corpPage).not.toMatch(/\$94|\$24/);

    const dba = source('app/(marketing)/guides/florida-fictitious-name-dba/page.tsx');
    expect(dba).toContain("tierPackagePriceCents('BASIC', 'LLC', 'FL')");
    expect(dba).toContain("tierPackagePriceCents('STANDARD', 'LLC', 'FL')");
    expect(dba).not.toMatch(/\$149|\$279/);

    const oa = source('lib/oa-guide-copy.ts');
    expect(oa).toContain("tierPackagePriceCents('STANDARD', 'LLC', 'FL')");
    expect(oa).toContain('${POPULAR_FL_LLC}');
    expect(oa).not.toMatch(/\$279/);

    const llms = source('lib/llms.ts');
    expect(llms).toContain("tierPriceParts('BASIC', 'LLC', 'FL')");
    expect(llms).toContain('${ESSENTIAL_PRICE}');
    expect(llms).not.toMatch(/\$149/);

    const knowledge = source('lib/assistant/knowledge.ts');
    expect(knowledge).toContain('tierPackagePriceCents');
    expect(knowledge).not.toMatch(/\$149|\$279|\$449|\$80/);

    const annual = source('components/marketing/AnnualReportSection.tsx');
    expect(annual).toContain('ANNUAL_REPORT_SERVICE_FEE_CENTS');
    expect(annual).not.toMatch(/\$80/);
    expect(source('app/(marketing)/file-annual-report/page.tsx')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS',
    );
    expect(source('components/marketing/GuestAnnualReportForm.tsx')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFee + raAddon',
    );
  });

  it('computes Stripe amounts on the server from the catalog', () => {
    const route = source('app/api/stripe/payment-intent/route.ts');
    expect(route).toContain('The amount is computed here and the client amount is ignored.');
    expect(route).toContain('computeCost(');
    expect(route).toContain('amount: priced.amountCents');
    expect(route).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + compliance.baseFeeCents + raFee',
    );
    expect(route).not.toMatch(/amount:\s*body\.amountCents/);
    expect(route).not.toMatch(/prices\.(create|retrieve)|price_/);

    const report = source('actions/annual-report.ts');
    expect(report).toContain('ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFee + raFee');
    expect(report).toContain('Math.abs(pi.amount - totalCents)');
  });

  it('leaves no stale formation headlines in customer-facing copy', () => {
    const files = [
      'messages/en.json',
      'messages/es.json',
      'lib/llms.ts',
      'lib/oa-guide-copy.ts',
      'lib/assistant/knowledge.ts',
      'lib/pricing.ts',
      'app/(marketing)/pricing/page.tsx',
      'app/(marketing)/offer/page.tsx',
      'app/(marketing)/guides/how-to-form-a-florida-corporation/page.tsx',
      'app/(marketing)/guides/florida-fictitious-name-dba/page.tsx',
      'app/(marketing)/file-annual-report/page.tsx',
      'components/marketing/AnnualReportSection.tsx',
      'components/marketing/PricingTable.tsx',
      'components/marketing/HowItWorks.tsx',
      'components/seo/JsonLd.tsx',
    ];
    const stale = /\$149\b|\$279\b|\$449\b|\$94\b|\$80\b/;
    const hits: string[] = [];
    for (const file of files) {
      const text = source(file);
      text.split('\n').forEach((line, index) => {
        if (stale.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
