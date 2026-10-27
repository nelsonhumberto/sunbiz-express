import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const COPY_KEYS = [
  'entityTypeLabel',
  'entityHeadsUp',
  'entityCompareTitle',
  'entityCompareShow',
  'entityCompareHide',
  'entityCompareLlcTitle',
  'entityCompareLlcBody',
  'entityCompareCorpTitle',
  'entityCompareCorpBody',
  'entityCompareDisclaimer',
  'customerNoteWY',
  'customerNoteDE',
  'entityHint',
] as const;

describe('wizard step 1 copy and events', () => {
  it('has Spanish step 1 strings without em dashes or gendered address', () => {
    for (const key of COPY_KEYS) {
      const value = es.wizard[key];
      expect(value, key).toBeTruthy();
      expect(value, key).not.toMatch(/[—–]/);
      expect(value, key).not.toMatch(/\b(listo|lista|bienvenido|bienvenida|seguro|segura)\b/i);
    }
    expect(es.wizard.entityLLCDesc2).toBe('Tributación de traspaso por defecto');
    expect(es.wizard.entityCompareTitle).toBe('¿LLC o corporación? En 30 segundos');
    expect(es.wizard.entityHeadsUp.startsWith('Ojo:')).toBe(true);
    expect(en.wizard.entityCompareTitle).toBe('Not sure? LLC vs Corporation in 30 seconds');
    expect(en.wizard.entityHeadsUp).not.toMatch(/[—–]/);
  });

  it('renders those strings from messages and tracks entity and continue clicks', () => {
    const step = readFileSync('components/wizard/steps/Step1Entity.tsx', 'utf8');
    expect(step).not.toContain('Not sure?');
    expect(step).not.toContain('Heads up:');
    expect(step).not.toContain('Pick LLC');
    expect(step).toContain("t('entityCompareTitle')");
    expect(step).toContain("t('entityHeadsUp'");
    expect(step).toContain("t('customerNoteWY')");
    expect(step).toContain("t('customerNoteDE')");
    expect(step).toContain("trackEvent(\n                  'wizard_entity_selected'");
    expect(step).toContain("trackEvent(\n      'wizard_step1_continue_clicked'");
    expect(step).toContain('wizardEntitySelectedProperties');
    expect(step).toContain('wizardStep1ContinueProperties');
    expect(step).toContain('filingId: filing.id');
    expect(step).toContain('locale');
    expect(step).not.toMatch(/trackEvent\([\s\S]{0,220}(email|businessName|firstName)\s*:/);

    const page = readFileSync('app/wizard/[filingId]/[step]/page.tsx', 'utf8');
    expect(page).toContain('!realGuestEmail && !typedGuestEmail && !storedPendingAccountEmail');
  });
});
