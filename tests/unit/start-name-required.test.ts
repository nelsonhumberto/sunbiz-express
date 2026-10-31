import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkoutFunnelEventProperties,
  checkoutSuccessViewStorageKey,
  filingIdFromWizardPath,
  startNameSubmittedProperties,
} from '@/lib/analytics';
import { guestWizardStep, startNameIsAcceptable } from '@/lib/start-draft';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(rel: string): string {
  return readFileSync(rel, 'utf8');
}

describe('start name is required before the wizard', () => {
  it('rejects a name that is under 2 characters or only a legal ending', () => {
    expect(startNameIsAcceptable('')).toBe(false);
    expect(startNameIsAcceptable('A')).toBe(false);
    expect(startNameIsAcceptable('A LLC')).toBe(false);
    expect(startNameIsAcceptable('!!')).toBe(false);
    expect(startNameIsAcceptable('Niño')).toBe(true);
    expect(startNameIsAcceptable('  Sol Norte  ')).toBe(true);
  });

  it('does not land a guest on step 1 without a name', () => {
    expect(guestWizardStep({ businessName: null, currentStep: 1 })).toBe(2);
    expect(guestWizardStep({ businessName: '', currentStep: 1 })).toBe(2);
    expect(guestWizardStep({ businessName: 'A LLC', currentStep: 1 })).toBe(2);
    expect(guestWizardStep({ businessName: 'Sol Norte', currentStep: 1 })).toBe(1);
    expect(guestWizardStep({ businessName: null, currentStep: 4 })).toBe(4);

    const action = source('actions/guest-start.ts');
    const page = source('app/wizard/[filingId]/[step]/page.tsx');
    expect(action).toContain('startNameIsAcceptable');
    expect(action).not.toContain('seededName ? 2 : 1');
    expect(action).not.toContain('seededName ? 1 : 2');
    expect(page).toContain('guestWizardStep');
    expect(page).toContain('stepNum === 1');
    expect(source('components/wizard/steps/Step1Entity.tsx')).toContain('export function Step1Entity');
    expect(source('app/start/guest-start-launch.tsx')).not.toContain('/api/sunbiz');
    expect(source('app/start/guest-start-launch.tsx')).not.toContain('name-check');
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain('seededBusinessName(filing.businessName)');
    expect(source('components/wizard/steps/Step2Name.tsx')).toContain('nameHasMinimumSubstance');
  });
});

describe('optional start email and checkout analytics', () => {
  it('keeps the new copy plain in English and Spanish', () => {
    expect(en.start.nameYourLlc).toBe('Name your LLC');
    expect(es.start.nameYourLlc).toBe('Ponle nombre a tu LLC');
    expect(en.start.switchToCorp).toBe('Forming a corporation instead?');
    expect(es.start.switchToCorp).toBe('¿Prefieres una corporación?');
    expect(en.start.nameHelper).toBe('You can change it before we file.');
    expect(es.start.nameHelper).toBe('Puedes cambiarlo antes de que hagamos el registro.');
    expect(es.start.emailOptionalHint).toBe('Te enviamos un enlace a este borrador.');
    expect(es.start.switchToLlc).toBe('¿Prefieres una LLC?');
    for (const copy of [
      en.start.nameYourLlc,
      en.start.nameYourCorp,
      en.start.nameHelper,
      en.start.switchToCorp,
      en.start.switchToLlc,
      en.start.emailOptional,
      en.start.emailOptionalHint,
      en.start.emailOptionalInvalid,
      es.start.nameYourLlc,
      es.start.nameYourCorp,
      es.start.nameHelper,
      es.start.switchToCorp,
      es.start.switchToLlc,
      es.start.emailOptional,
      es.start.emailOptionalHint,
      es.start.emailOptionalInvalid,
      en.wizard.nameTooShort,
      es.wizard.nameTooShort,
      en.wizard.nameTooLong,
      es.wizard.nameTooLong,
      en.wizard.nameManualBody,
      es.wizard.nameManualBody,
    ]) {
      expect(copy).not.toMatch(/\u2014|\u2013/);
      expect(copy.trim().length).toBeGreaterThan(0);
    }
    expect(es.start.emailOptionalInvalid).not.toMatch(/\b(listo|lista|bienvenido|bienvenida)\b/i);
    expect(source('actions/guest-email.ts')).toContain("type: 'FILING_STARTED'");
    expect(source('actions/guest-email.ts')).toContain('storeGuestEmailOnDraft');
    expect(source('actions/guest-start.ts')).toContain('emailOptionalInvalid');
    expect(source('app/start/guest-start-launch.tsx')).toContain('showOptionalEmail');
  });

  it('sends checkout and start events without email or name', () => {
    expect(
      checkoutFunnelEventProperties({
        filingId: 'filing_1',
        plan: 'STANDARD',
        amountCents: 27900,
        locale: 'es',
        isTest: false,
      }),
    ).toEqual({
      filing_id: 'filing_1',
      plan: 'STANDARD',
      amount: 279,
      locale: 'es',
      is_test: false,
    });
    expect(
      checkoutFunnelEventProperties({
        filingId: 'filing_1',
        plan: 'BASIC',
        amountCents: 14900,
        locale: 'en',
      }),
    ).toEqual({
      filing_id: 'filing_1',
      plan: 'BASIC',
      amount: 149,
      locale: 'en',
    });
    expect(startNameSubmittedProperties({ filingId: 'filing_1', locale: 'es' })).toEqual({
      filing_id: 'filing_1',
      locale: 'es',
    });
    expect(Object.keys(startNameSubmittedProperties({ filingId: 'filing_1', locale: 'en' }))).not.toEqual(
      expect.arrayContaining(['email', 'name', 'business_name']),
    );
    expect(filingIdFromWizardPath('/es/wizard/filing_1/2')).toBe('filing_1');
    expect(filingIdFromWizardPath('/wizard/filing_1/11?x=1')).toBe('filing_1');
    expect(checkoutSuccessViewStorageKey('filing_1')).toBe('lf_checkout_success_viewed:filing_1');

    const payment = source('components/wizard/steps/Step12Payment.tsx');
    const success = source('components/analytics/CheckoutConversionTracker.tsx');
    const shell = source('components/wizard/WizardShell.tsx');
    const launch = source('app/start/guest-start-launch.tsx');
    expect(payment).toContain("trackEvent('checkout_payment_step_viewed'");
    expect(payment).toContain("trackEvent('checkout_payment_submitted'");
    expect(payment).toContain('serverTotalCents');
    expect(success).toContain("trackEvent(\n        'checkout_success_viewed'");
    expect(success).toContain('checkoutSuccessAlreadyViewed');
    expect(success).toContain('markCheckoutSuccessViewed');
    expect(shell).toContain("trackEvent('wizard_step_viewed'");
    expect(shell).toContain('preselectedEventProps(preselected)');
    expect(source('components/wizard/useWizardSubmit.ts')).toContain("trackEvent('wizard_step_completed'");
    expect(launch).toContain('await captureThenNavigate');
    expect(launch).toContain('startNavigationEvents');
    expect(launch.indexOf('await captureThenNavigate')).toBeLessThan(
      launch.indexOf('window.location.assign(href)'),
    );
    for (const file of [payment, success, launch, source('components/wizard/useWizardSubmit.ts')]) {
      expect(file).not.toMatch(/trackEvent\([\s\S]{0,180}(email|businessName|firstName)\s*:/);
    }
  });
});
