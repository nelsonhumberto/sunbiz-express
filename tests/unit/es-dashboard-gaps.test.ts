import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayedCertificateTitle } from '@/lib/certificate-addons';
import { formatDueLabel } from '@/lib/due-label';
import { localizedPackageLabel } from '@/lib/tier-display';
import { formatDateLong } from '@/lib/utils';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

const en = JSON.parse(readFileSync('messages/en.json', 'utf8'));
const es = JSON.parse(readFileSync('messages/es.json', 'utf8'));

describe('Spanish dashboard and wizard gaps', () => {
  it('keeps dashboard links, auth redirects, and a bounced guest on the current locale', () => {
    const nav = source('components/dashboard/DashboardNav.tsx');
    expect(nav).toContain('hrefForLocale');
    expect(nav).toContain('englishPathname');
    expect(nav).toContain("tNav('dashboard')");
    expect(nav).not.toContain('aria-label="Dashboard"');

    const layout = source('app/(app)/layout.tsx');
    expect(layout).toContain("redirectLocalized('/sign-in')");
    expect(layout).not.toContain("redirect('/sign-in')");
    expect(layout).toContain('overflow-x-clip');
    expect(layout).toContain('min-w-0');

    const wizard = source('actions/wizard.ts');
    expect(wizard).toContain("redirectLocalized(actor.kind === 'guest' ? '/' : '/dashboard')");
    expect(wizard).not.toContain('filing?.locale');

    const dash = source('app/(app)/dashboard/page.tsx');
    expect(dash).not.toContain('pickLocale');
    expect(dash).toContain('hrefForLocale(`/wizard/${filing.id}/${step}`, locale)');
    expect(source('app/(app)/dashboard/start-filing-button.tsx')).toContain('min-w-0');
    expect(source('components/dashboard/AddExistingCompanyButton.tsx')).toContain('whitespace-normal');
  });

  it('translates package and document names in the UI', () => {
    expect(
      localizedPackageLabel({
        storedLabel: 'Essential - Florida LLC',
        tierSlug: 'BASIC',
        entityType: 'LLC',
        translate: (key) =>
          key === 'tier_BASIC' ? 'Esencial' : key === 'packageEntityLlc' ? 'LLC' : key,
      }),
    ).toBe('Esencial - Florida LLC');
    expect(
      localizedPackageLabel({
        storedLabel: 'Essential - Florida Corporation',
        tierSlug: 'BASIC',
        entityType: 'CORP',
        translate: (key) =>
          key === 'tier_BASIC' ? 'Esencial' : key === 'packageEntityCorp' ? 'Corporación' : key,
      }),
    ).toBe('Esencial - Florida Corporación');
    expect(es.pricing.tier_BASIC).toBe('Esencial');
    expect(es.pricing.feat_articles).toMatch(/Artículos/);
    expect(es.pricing.feat_articles).not.toMatch(/Articles of Organization/);
    expect(
      displayedCertificateTitle('ARTICLES_ORG', 'Articles of Organization', {
        ARTICLES_ORG: es.documentTypes.ARTICLES_ORG,
      }),
    ).toBe('Artículos de Organización');
    expect(displayedCertificateTitle('RECEIPT', 'Receipt', {})).toBe('Receipt');
    expect(source('app/(app)/dashboard/documents/page.tsx')).toContain('TYPE_LABEL');
  });

  it('uses es-US dates and the translated compliance page', () => {
    const october = new Date(2027, 9, 24);
    expect(formatDateLong(october, 'es')).toBe('24 de octubre de 2027');
    expect(formatDueLabel('Vence', october, 'es')).toBe('Vence 24 de octubre de 2027');
    expect(formatDateLong(october)).toBe('October 24, 2027');
    const page = source('app/(app)/dashboard/compliance/page.tsx');
    expect(page).toContain("t('complianceTitle')");
    expect(page).toContain('formatLongDate');
    expect(page).toContain('formatDueLabel(t(\'due\'), report.dueDate, locale)');
    expect(page).not.toContain('Compliance Calendar');
    expect(es.dashboard.complianceTitle).toMatch(/Cumplimiento/);
  });

  it('translates the skip link, 404, guarantee, and the account prompt', () => {
    expect(source('components/a11y/SkipLink.tsx')).toContain("t('skipToContent')");
    expect(es.common.skipToContent).toBe('Saltar al contenido principal');
    expect(source('app/not-found.tsx')).toContain("getTranslations('notFound')");
    expect(es.notFound.title).toMatch(/página/i);
    expect(es.notFound.body).not.toMatch(/\u2014|\u2013/);
    expect(en.wizard.nameGuaranteeTitle).toBe('Our name approval guarantee');
    expect(es.wizard.nameGuaranteeTitle).toMatch(/garantía/i);
    expect(es.wizard.nameGuaranteeBody).not.toMatch(/\u2014|\u2013/);
    expect(en.wizard.guestEmailHasAccount).not.toMatch(/at checkout/i);
    expect(es.wizard.guestEmailHasAccount).not.toMatch(/al pagar/);
    expect(es.wizard.guestEmailHasAccount).toMatch(/Entra/);
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain("t('nameGuaranteeTitle')");
    expect(source('components/wizard/steps/Step2Name.tsx')).not.toContain('Our name approval guarantee');
    const step2 = source('components/wizard/steps/Step2Name.tsx');
    const gate = step2.indexOf("if ('needsSignIn' in res && res.needsSignIn)");
    expect(gate).toBeGreaterThan(-1);
    expect(step2.slice(gate, gate + 180)).toContain('return;');
    expect(source('actions/guest-start.ts')).toContain("error: t('guestEmailHasAccount')");
  });
});
