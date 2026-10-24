import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatLongDate, longDateLocale } from '@/lib/due-label';
import { OA_GUIDE_EN, oaGuideLead, oaGuideMeta } from '@/lib/oa-guide-copy';
import { pageTitle } from '@/lib/seo-title';

const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
  wizard: Record<string, string>;
  annualReportPage: { metaTitle: string };
  guideOa: Record<string, string>;
};
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
  wizard: Record<string, string>;
};

const spanishGuide = {
  ...OA_GUIDE_EN,
  metaTitle: es.guideOa.metaTitle,
  metaDescription: es.guideOa.metaDescription,
  metaTitleNeutral: es.guideOa.metaTitleNeutral,
  metaDescriptionNeutral: es.guideOa.metaDescriptionNeutral,
  lead: es.guideOa.description,
  downloadLead: es.guideOa.downloadLead,
};

describe('Spanish payment step copy', () => {
  it('translates the card details label', () => {
    expect(en.wizard.cardDetails).toBe('Card details');
    expect(es.wizard.cardDetails).toBe('Datos de la tarjeta');
    const step = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');
    expect(step).toContain("t('cardDetails')");
    expect(step).not.toContain('<Label>Card details</Label>');
  });
});

describe('locale long dates', () => {
  const october = new Date(2027, 9, 24);

  it('formats the renewal date in Spanish and English', () => {
    expect(longDateLocale('es')).toBe('es-US');
    expect(longDateLocale('es-US')).toBe('es-US');
    expect(formatLongDate(october, 'es')).toBe('24 de octubre de 2027');
    expect(formatLongDate(october, 'es-US')).toBe('24 de octubre de 2027');
    expect(formatLongDate(october, 'en')).toBe('October 24, 2027');
    expect(formatLongDate(october)).toBe('October 24, 2027');
    const step = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');
    expect(step).toContain('formatLongDate(firstRenewalDate, locale)');
  });
});

describe('Spanish annual report title', () => {
  it('does not append a second LaunchForma through the title template', () => {
    const phrase = es.annualReportPage.metaTitle;
    expect(phrase).toBe('Presenta tu reporte anual de Florida | LaunchForma');
    expect(pageTitle(phrase)).toEqual({ absolute: phrase });
    const page = readFileSync('app/(marketing)/file-annual-report/page.tsx', 'utf8');
    expect(page).toContain("pageTitle(t('metaTitle'))");
  });
});

describe('payment sticky bar padding', () => {
  it('matches the measured bar height plus the safe-area inset at every width', () => {
    const step = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');
    const shell = readFileSync('components/wizard/WizardShell.tsx', 'utf8');
    expect(step).toContain(
      'pb-[calc(var(--wizard-actions-height,5rem)+env(safe-area-inset-bottom))]',
    );
    expect(step).not.toMatch(/(sm|md|lg|xl):pb-/);
    expect(shell).toContain("'--wizard-actions-height'");
    expect(shell).toContain('getBoundingClientRect');
  });
});

describe('operating agreement sample copy', () => {
  it('promises a free sample only while the download flag is on', () => {
    expect(oaGuideMeta(OA_GUIDE_EN, true).title).toContain('Free Sample & Guide');
    expect(oaGuideLead(OA_GUIDE_EN, true)).toContain('download a free sample template below');
    expect(oaGuideMeta(OA_GUIDE_EN, false).title).not.toContain('Free Sample');
    expect(oaGuideMeta(OA_GUIDE_EN, false).description).not.toMatch(/free sample/i);
    expect(oaGuideLead(OA_GUIDE_EN, false)).not.toContain('download a free sample template below');

    expect(oaGuideMeta(spanishGuide, true).description).toContain('Descarga una plantilla gratis');
    expect(oaGuideLead(spanishGuide, true)).toContain('plantilla de muestra gratis');
    expect(oaGuideMeta(spanishGuide, false).title).not.toMatch(/muestra gratis/i);
    expect(oaGuideMeta(spanishGuide, false).description).not.toMatch(/plantilla/i);
    expect(oaGuideLead(spanishGuide, false)).not.toContain('plantilla de muestra gratis');
    expect(es.guideOa.metaDescriptionNeutral).not.toMatch(/—|–/);
    expect(OA_GUIDE_EN.metaTitleNeutral).not.toMatch(/—|–/);

    const page = readFileSync(
      'app/(marketing)/guides/florida-llc-operating-agreement/page.tsx',
      'utf8',
    );
    expect(page).toContain('oaGuideMeta(copy, oaTemplateDownloadEnabled())');
    expect(page).toContain('oaGuideLead(copy, downloadEnabled)');
  });
});
