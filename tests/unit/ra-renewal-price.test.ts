import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';
import { buildPostFormationEmail } from '@/lib/post-formation-email';
import { RA_RENEWAL_PRICE_CENTS } from '@/lib/pricing';
import { formatRaRenewalPrice, raRenewalChargeCents } from '@/lib/ra-renewal-price';

const SITE = 'https://launchforma.com';

const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
  dashboard: Record<string, string>;
  addCompany: Record<string, string>;
  filingDetail: Record<string, string>;
  wizard: Record<string, string>;
};
const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
  dashboard: Record<string, string>;
  addCompany: Record<string, string>;
  filingDetail: Record<string, string>;
  wizard: Record<string, string>;
};

function withPrice(template: string, cents: number | null): string {
  return template.replaceAll('{price}', formatRaRenewalPrice(cents));
}

const day30 = {
  step: 'DAY_30' as const,
  firstName: 'Ana',
  businessName: 'Northwind LLC',
  filingId: 'fil_1',
  siteUrl: SITE,
  unsubscribeUrl: `${SITE}/unsubscribe?token=abc`,
};

describe('Registered Agent renewal price', () => {
  it('formats 11900 as $119 and 15000 as $150', () => {
    expect(formatRaRenewalPrice(11900)).toBe('$119');
    expect(formatRaRenewalPrice(15000)).toBe('$150');
    expect(raRenewalChargeCents(11900)).toBe(11900);
    expect(raRenewalChargeCents(15000)).toBe(15000);
  });

  it('falls back to the current default when renewalPriceCents is null', () => {
    expect(RA_RENEWAL_PRICE_CENTS).toBe(15000);
    expect(raRenewalChargeCents(null)).toBe(RA_RENEWAL_PRICE_CENTS);
    expect(raRenewalChargeCents(undefined)).toBe(RA_RENEWAL_PRICE_CENTS);
    expect(formatRaRenewalPrice(null)).toBe('$150');
    expect(formatRaRenewalPrice(undefined)).toBe('$150');
  });

  it.each(['RA_RENEWAL_60', 'RA_RENEWAL_30', 'RA_RENEWAL_7'] as const)(
    '%s shows the customer price, including the null fallback',
    (type) => {
      const grandfathered = renderTemplate(type, {
        businessName: 'Northwind LLC',
        raRenewalPriceCents: 11900,
      });
      const standard = renderTemplate(type, {
        businessName: 'Northwind LLC',
        raRenewalPriceCents: 15000,
      });
      const missing = renderTemplate(type, {
        businessName: 'Northwind LLC',
        raRenewalPriceCents: null,
      });
      const autoRenew = renderTemplate(type, {
        businessName: 'Northwind LLC',
        raAutoRenew: true,
        raRenewalPriceCents: 11900,
      });

      expect(grandfathered.html).toContain('$119');
      expect(grandfathered.html).not.toContain('$150');
      expect(standard.html).toContain('$150');
      expect(standard.html).not.toContain('$119');
      expect(missing.html).toContain('$150');
      expect(autoRenew.html).toContain('$119');
      expect(autoRenew.html).not.toContain('$150');
    },
  );

  it('renewal receipt uses the charged customer price', () => {
    expect(renderTemplate('RA_RENEWED', { businessName: 'Northwind LLC', totalCents: 11900 }).html).toContain(
      '$119',
    );
    expect(renderTemplate('RA_RENEWED', { businessName: 'Northwind LLC', totalCents: 15000 }).html).toContain(
      '$150',
    );
  });

  it('day 30 post-formation mail uses the customer price in English and Spanish', () => {
    const low = buildPostFormationEmail({ ...day30, locale: 'en', renewalPriceCents: 11900 });
    const high = buildPostFormationEmail({ ...day30, locale: 'en', renewalPriceCents: 15000 });
    const missing = buildPostFormationEmail({ ...day30, locale: 'en', renewalPriceCents: null });
    const spanish = buildPostFormationEmail({ ...day30, locale: 'es', renewalPriceCents: 11900 });
    const spanishDefault = buildPostFormationEmail({ ...day30, locale: 'es', renewalPriceCents: null });

    expect(low.inner).toContain('keep the service for $119 a year');
    expect(low.inner).not.toContain('$150');
    expect(high.inner).toContain('keep the service for $150 a year');
    expect(missing.inner).toContain('keep the service for $150 a year');
    expect(spanish.inner).toContain('mantener el servicio por $119 al año');
    expect(spanish.inner).toContain('puedes mantener');
    expect(spanish.inner).toContain('inicia sesión');
    expect(spanish.inner).not.toMatch(/\busted\b/i);
    expect(spanish.inner).not.toContain('$150');
    expect(spanish.inner).not.toContain('—');
    expect(spanish.inner).not.toContain('–');
    expect(spanishDefault.inner).toContain('mantener el servicio por $150 al año');

    const wrapped = renderTemplate('POST_FORMATION_DAY_30', {
      businessName: 'Northwind LLC',
      locale: 'es',
      linkFilingId: 'fil_1',
      raRenewalPriceCents: 11900,
    });
    expect(wrapped.html).toContain('$119');
    expect(wrapped.html).not.toContain('$150');
  });

  it('dashboard and wizard copy interpolate the customer price', () => {
    expect(withPrice(en.dashboard.raRenewalPrice, 11900)).toBe('$119/yr · cancel anytime');
    expect(withPrice(en.dashboard.raRenewalPrice, 15000)).toBe('$150/yr · cancel anytime');
    expect(withPrice(en.dashboard.raRenewalPrice, null)).toBe('$150/yr · cancel anytime');
    expect(withPrice(es.dashboard.raRenewalPrice, 11900)).toBe('$119/año · cancela cuando quieras');
    expect(withPrice(es.dashboard.raRenewalPrice, 15000)).toBe('$150/año · cancela cuando quieras');
    expect(es.dashboard.raRenewalPrice).not.toContain('—');
    expect(es.dashboard.raRenewalPrice).not.toContain('–');

    expect(withPrice(en.addCompany.raUpsellBody, null)).toContain('$150/year');
    expect(withPrice(en.addCompany.raUpsellBody, null)).not.toContain('$119');
    expect(withPrice(es.addCompany.raUpsellBody, null)).toContain('$150/año');
    expect(withPrice(es.addCompany.raUpsellBody, 11900)).toContain('$119/año');
    expect(es.addCompany.raUpsellBody).toContain('cuando quieras');
    expect(es.addCompany.raUpsellBody).not.toMatch(/\busted\b/i);
    expect(es.addCompany.raUpsellBody).not.toContain('—');
    expect(es.addCompany.raUpsellBody).not.toContain('–');

    expect(withPrice(en.filingDetail.nonUsRaBody, 11900)).toContain('$119/year');
    expect(withPrice(en.filingDetail.nonUsRaBody, 11900)).not.toContain('$150');
    expect(withPrice(en.filingDetail.nonUsRaBody, null)).toContain('$150/year');
    expect(withPrice(es.filingDetail.nonUsRaBody, 11900)).toContain('$119/año');
    expect(withPrice(es.filingDetail.nonUsRaBody, null)).toContain('$150/año');
    expect(es.filingDetail.nonUsRaBody).toContain('tu agente');
    expect(es.filingDetail.nonUsRaBody).not.toMatch(/\busted\b/i);
    expect(es.filingDetail.nonUsRaBody).not.toContain('—');
    expect(es.filingDetail.nonUsRaBody).not.toContain('–');

    expect(withPrice(en.wizard.useOurAgentP3, null)).toBe('Year-1 free, then $150/year (cancel anytime)');
    expect(withPrice(es.wizard.useOurAgentP3, null)).toBe(
      'Año 1 gratis, luego $150/año (cancela cuando quieras)',
    );
    expect(withPrice(en.wizard.ownAgentConfirmBenefit2, null)).toBe(
      'Free for the first year, then $150/yr. Cancel anytime.',
    );
    expect(withPrice(es.wizard.ownAgentConfirmBenefit2, null)).toBe(
      'Gratis el primer año, luego $150/año. Cancela cuando quieras.',
    );
  });

  it('wires each customer row into the email, dashboard, and reminder, and leaves new-buyer pages on the catalog', () => {
    const filings = readFileSync('actions/filings.ts', 'utf8');
    expect(filings).toContain('renewalPriceCents: stateRule.registeredAgent.renewalCents');
    const route = readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8');
    expect(route).toContain('amountCents: service.renewalPriceCents');
    const reminders = readFileSync('lib/draft-recovery.ts', 'utf8');
    expect(reminders).toContain('raRenewalPriceCents: svc.renewalPriceCents');
    expect(readFileSync('lib/email.ts', 'utf8')).toContain('formatRaRenewalPrice(ctx.raRenewalPriceCents)');
    expect(readFileSync('lib/post-formation-job.ts', 'utf8')).toContain(
      'raRenewalPriceCents: filing.raServices[0]?.renewalPriceCents ?? null',
    );
    expect(readFileSync('app/(app)/dashboard/page.tsx', 'utf8')).toContain(
      'formatRaRenewalPrice(svc.renewalPriceCents)',
    );
    expect(readFileSync('app/(app)/dashboard/filings/[id]/page.tsx', 'utf8')).toContain(
      'formatRaRenewalPrice(activeRa?.renewalPriceCents)',
    );
    expect(readFileSync('components/dashboard/AddCompanyForm.tsx', 'utf8')).toContain(
      'formatRaRenewalPrice(null)',
    );
    expect(readFileSync('components/dashboard/RenewRegisteredAgentForm.tsx', 'utf8')).toContain(
      'raRenewalChargeCents(props.renewalPriceCents)',
    );
    const leaf = readFileSync('lib/ra-renewal-price.ts', 'utf8');
    expect(leaf).toContain('export const RA_RENEWAL_PRICE_CENTS = 15_000');
    expect(leaf).toContain('return renewalPriceCents ?? RA_RENEWAL_PRICE_CENTS');
    expect(readFileSync('lib/pricing.ts', 'utf8')).toContain('export { RA_RENEWAL_PRICE_CENTS }');
    expect(readFileSync('lib/pricing.ts', 'utf8')).toContain(
      'export const RA_ANNUAL_SERVICE_FEE_CENTS = RA_RENEWAL_PRICE_CENTS',
    );

    // New buyers and generic marketing stay on the catalog price, not a customer row.
    const step6 = readFileSync('components/wizard/steps/Step6RegisteredAgent.tsx', 'utf8');
    expect(step6).toContain('formatCurrency(internalAgent.renewalCents)');
    expect(step6).not.toContain('formatRaRenewalPrice');
    expect(readFileSync('components/marketing/AnnualReportSection.tsx', 'utf8')).toContain(
      'formatCurrency(RA_RENEWAL_PRICE_CENTS)',
    );
    expect(readFileSync('app/(compliance-landing)/business-services/page.tsx', 'utf8')).toContain(
      'formatCurrency(RA_RENEWAL_PRICE_CENTS)',
    );
    expect(readFileSync('lib/marketing-faq.ts', 'utf8')).not.toContain('formatRaRenewalPrice');
  });
});
