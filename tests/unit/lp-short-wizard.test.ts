import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LP_SHORT_STEPS,
  LP_SHORT_TOTAL,
  lpProgressFromDraft,
  lpProgressLabel,
  lpRouteStep,
  usesLpShortWizard,
} from '@/lib/lp-wizard-path';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const empty = {
  hasName: false,
  hasPrincipal: false,
  hasMailing: false,
  hasAgent: false,
  hasMember: false,
  hasSignature: false,
};

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('LP short wizard routing', () => {
  it('uses the short path only for landing drafts, not /start, pricing, or CORP', () => {
    const flagged = JSON.stringify({ floridaLlcPreselected: true });
    expect(
      usesLpShortWizard({
        optionalDetails: flagged,
        entryPath: '/lp/florida-llc',
        entityType: 'LLC',
      }),
    ).toBe(true);
    expect(
      usesLpShortWizard({
        optionalDetails: flagged,
        entryPath: '/es/lp/llc-florida',
        entityType: 'LLC',
      }),
    ).toBe(true);
    expect(
      usesLpShortWizard({ optionalDetails: flagged, entryPath: null, entityType: 'LLC' }),
    ).toBe(true);
    expect(
      usesLpShortWizard({
        optionalDetails: flagged,
        entryPath: '/start',
        entityType: 'LLC',
      }),
    ).toBe(false);
    expect(
      usesLpShortWizard({
        optionalDetails: flagged,
        entryPath: '/es/start',
        entityType: 'LLC',
      }),
    ).toBe(false);
    expect(
      usesLpShortWizard({
        optionalDetails: flagged,
        entryPath: '/pricing',
        entityType: 'LLC',
      }),
    ).toBe(false);
    expect(
      usesLpShortWizard({
        optionalDetails: flagged,
        entryPath: '/lp/florida-llc',
        entityType: 'CORP',
      }),
    ).toBe(false);
    expect(
      usesLpShortWizard({
        optionalDetails: '{}',
        entryPath: '/lp/florida-llc',
        entityType: 'LLC',
      }),
    ).toBe(false);
  });

  it('maps the six screens and sends skipped URLs to the right step', () => {
    expect(LP_SHORT_TOTAL).toBe(6);
    expect(LP_SHORT_STEPS).toEqual([2, 4, 7, 9, 10, 11]);
    expect(lpProgressLabel(2)).toEqual({ current: 1, total: 6 });
    expect(lpProgressLabel(4)).toEqual({ current: 2, total: 6 });
    expect(lpProgressLabel(7)).toEqual({ current: 3, total: 6 });
    expect(lpProgressLabel(9)).toEqual({ current: 4, total: 6 });
    expect(lpProgressLabel(10)).toEqual({ current: 5, total: 6 });
    expect(lpProgressLabel(11)).toEqual({ current: 6, total: 6 });

    expect(lpRouteStep(2, empty)).toBe(2);
    expect(lpRouteStep(3, { ...empty, hasName: true })).toBe(4);
    expect(lpRouteStep(7, { ...empty, hasName: true })).toBe(4);
    expect(lpRouteStep(11, { ...empty, hasName: true })).toBe(4);

    const addressed = {
      ...empty,
      hasName: true,
      hasPrincipal: true,
      hasMailing: true,
      hasAgent: true,
    };
    expect(lpRouteStep(5, addressed)).toBe(7);
    expect(lpRouteStep(6, addressed)).toBe(7);
    expect(lpRouteStep(8, { ...addressed, hasMember: true })).toBe(9);
    expect(lpRouteStep(11, { ...addressed, hasMember: true })).toBe(9);

    const signed = { ...addressed, hasMember: true, hasSignature: true };
    expect(lpRouteStep(8, signed)).toBe(10);
    expect(lpRouteStep(10, signed)).toBe(10);
    expect(lpRouteStep(11, signed)).toBe(11);
    expect(lpRouteStep(9, signed)).toBe(9);
  });

  it('treats a same-as-principal mailing and our agent as collected', () => {
    const progress = lpProgressFromDraft({
      businessName: 'Sol Norte LLC',
      principalAddress: JSON.stringify({ street1: '1 Main', city: 'Miami', state: 'FL', zip: '33101' }),
      mailingAddress: JSON.stringify('SAME_AS_PRINCIPAL'),
      registeredAgent: JSON.stringify({ useOurService: true, name: 'LaunchForma', street1: '2 Agent' }),
      memberNames: ['Ada Lovelace'],
      incorporatorSignature: 'Ada Lovelace',
    });
    expect(progress).toEqual({
      hasName: true,
      hasPrincipal: true,
      hasMailing: true,
      hasAgent: true,
      hasMember: true,
      hasSignature: true,
    });
    expect(lpRouteStep(11, lpProgressFromDraft({ businessName: 'Sol Norte LLC' }))).toBe(4);
  });

  it('keeps the 11-step page for other drafts and the short labels in both languages', () => {
    const page = source('app/wizard/[filingId]/[step]/page.tsx');
    expect(page).toContain('usesLpShortWizard');
    expect(page).toContain('if (!lpShort && stepNum === 11)');
    expect(page).toContain('lpShort ? <LpSetupStep');
    const shell = source('components/wizard/WizardShell.tsx');
    expect(shell).toContain('total: TOTAL_STEPS');
    expect(shell).toContain('LP_SHORT_TOTAL');
    expect(shell).not.toContain('x: 16');
    expect(en.wizard.mailingSame).toBe('Mailing address is the same');
    expect(en.wizard.continueToPayment).toBe('Continue to payment');
    expect(es.wizard.mailingSame).toBe('La dirección postal es la misma');
    expect(es.wizard.continueToPayment).toBe('Seguir al pago');
    for (const copy of [
      en.wizard.mailingSame,
      en.wizard.mailingDifferentHint,
      en.wizard.lpStep4Title,
      en.wizard.lpStep4Subtitle,
      en.wizard.continueToPayment,
      es.wizard.mailingSame,
      es.wizard.mailingDifferentHint,
      es.wizard.lpStep4Title,
      es.wizard.lpStep4Subtitle,
      es.wizard.continueToPayment,
    ]) {
      expect(copy).not.toMatch(/\u2014|\u2013/);
    }
    expect(es.wizard.mailingSame).not.toMatch(/\b(listo|lista|bienvenido|bienvenida)\b/i);
    expect(es.wizard.continueToPayment).not.toMatch(/\b(listo|lista|bienvenido|bienvenida)\b/i);
    const wizard = source('actions/wizard.ts');
    expect(wizard).toContain('lpShort ? 4 : 3');
    expect(wizard).toContain('if (deferAccount) return { ok: true }');
    expect(source('components/wizard/steps/Step11AddOns.tsx')).toContain("t('continueToPayment')");
  });
});
