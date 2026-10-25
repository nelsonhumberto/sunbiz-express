import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hrefForLocale } from '@/lib/app-href';
import { formatCurrency, safeRedirectPath } from '@/lib/utils';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

describe('LLC vs corporation card', () => {
  it('uses translated copy and keeps the Spanish free of gendered greetings and dashes', () => {
    const step = source('components/wizard/steps/Step1Entity.tsx');
    expect(step).toContain("t('entityCompareTitle')");
    expect(step).toContain("t('entityCompareLlcBody', { state: stateName })");
    expect(step).not.toContain('Not sure? LLC vs Corporation');
    expect(step).not.toContain('Pick LLC');
    expect(step).not.toContain('Pick Corporation');

    const keys = [
      'entityCompareTitle',
      'entityCompareShow',
      'entityCompareHide',
      'entityCompareLlcTitle',
      'entityCompareLlcBody',
      'entityCompareCorpTitle',
      'entityCompareCorpBody',
      'entityCompareDisclaimer',
    ] as const;
    for (const key of keys) {
      expect(en.wizard[key].length).toBeGreaterThan(0);
      expect(es.wizard[key].length).toBeGreaterThan(0);
      expect(en.wizard[key]).not.toMatch(/\u2014|\u2013/);
      expect(es.wizard[key]).not.toMatch(/\u2014|\u2013/);
      expect(es.wizard[key]).not.toMatch(/Bienvenido|Bienvenida/);
    }
    expect(es.wizard.entityCompareTitle).toBe('¿No sabes cuál elegir? LLC o corporación en 30 segundos');
    expect(es.wizard.entityCompareLlcBody).toContain('{state}');
    expect(en.wizard.entityCompareDisclaimer).toContain('not a law firm');
  });
});

describe('billing zero label', () => {
  it('says Gratis in Spanish and leaves the dollar amount alone', () => {
    expect(formatCurrency(0)).toBe('Free');
    expect(formatCurrency(0, { locale: 'en' })).toBe('Free');
    expect(formatCurrency(0, { locale: 'es' })).toBe('Gratis');
    expect(formatCurrency(0, { locale: 'es', showZero: true })).toBe('$0');
    expect(formatCurrency(14900, { locale: 'es' })).toBe('$149');
    const billing = source('app/(app)/dashboard/billing/page.tsx');
    expect(billing).toContain('formatCurrency(lifetimeCents, { locale })');
    expect(billing).toContain('formatCurrency(payment.amountCents, { locale })');
  });
});

describe('sign-in next path', () => {
  it('keeps a same-origin relative next and rejects absolute or protocol-relative URLs', () => {
    expect(safeRedirectPath('/wizard/filing_1/2?lf_internal=1')).toBe(
      '/wizard/filing_1/2?lf_internal=1',
    );
    expect(safeRedirectPath('/es/dashboard')).toBe('/es/dashboard');
    expect(safeRedirectPath('https://evil.example/phish')).toBeNull();
    expect(safeRedirectPath('http://evil.example')).toBeNull();
    expect(safeRedirectPath('//evil.example')).toBeNull();
    expect(safeRedirectPath('///evil.example')).toBeNull();
    expect(safeRedirectPath('/%2f%2fevil.example')).toBeNull();
    expect(safeRedirectPath('/%252f%252fevil.example')).toBeNull();
    expect(safeRedirectPath('/\\evil.example')).toBeNull();
    expect(safeRedirectPath('/\t/evil.example')).toBeNull();

    expect(hrefForLocale('/sign-up?next=%2Fwizard%2Ffiling_1%2F2', 'es')).toBe(
      '/es/sign-up?next=%2Fwizard%2Ffiling_1%2F2',
    );
    expect(hrefForLocale('/sign-in?next=%2Fes%2Fdashboard', 'en')).toBe(
      '/sign-in?next=%2Fes%2Fdashboard',
    );

    const signIn = source('app/(auth)/sign-in/page.tsx');
    expect(signIn).toContain('hrefForLocale(');
    expect(signIn).toContain('`/sign-up?next=${encodeURIComponent(nextPath)}`');
    expect(signIn).not.toContain("from '@/i18n/navigation'");

    const auth = source('actions/auth.ts');
    expect(auth).toContain('localizedRedirectHref(next ?? resume ?? \'/dashboard\', locale)');
    expect(auth).not.toContain("from '@/i18n/navigation'");
    expect(auth).not.toContain('localeRedirect({ href:');
  });
});
