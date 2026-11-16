'use client';

import { useState } from 'react';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { useTranslations } from 'next-intl';
import { Info, MapPin, ShieldCheck } from 'lucide-react';
import { saveStep4 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { useWizardSubmit } from '../useWizardSubmit';
import { AddressForm, type AddressValue } from '../AddressForm';
import { safeParseJson, cn, formatCurrency } from '@/lib/utils';
import { WIZARD_ACTION_TIMEOUT_MS } from '@/lib/action-timeout';
import {
  isActiveFormationState,
  getFormationState,
  type StateCode,
} from '@/lib/formation-states';
import { addressStepCompletedProperties } from '@/lib/registered-agent-choice';
import type { WizardFiling } from '../types';

type StoredPrincipal = AddressValue & { noFloridaAddress?: boolean };

export function Step4Address({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const filingState: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateRule = getFormationState(filingState);
  const addressRules = stateRule.addressRules;

  const parsed = safeParseJson<StoredPrincipal>(filing.principalAddress, {
    street1: '',
    city: '',
    state: filingState,
    zip: '',
  });
  const [address, setAddress] = useState<AddressValue>({
    street1: parsed.street1 ?? '',
    street2: parsed.street2,
    city: parsed.city ?? '',
    state: parsed.state || filingState,
    zip: parsed.zip ?? '',
    inCareOf: parsed.inCareOf,
  });
  const [noFloridaAddress, setNoFloridaAddress] = useState(parsed.noFloridaAddress === true);
  const [showMissing, setShowMissing] = useState(false);
  const { pending, error, run } = useWizardSubmit();
  const router = useLocalizedRouter(filing.locale);

  const principalRequired = addressRules.principalAddressRequired;
  const filledOut =
    address.street1.trim() &&
    address.city.trim() &&
    address.state &&
    address.zip.trim();
  // "I don't have a {state} address" still needs the customer's own principal
  // street. It never substitutes the registered agent address.
  const principalStillRequired = principalRequired || noFloridaAddress;
  const valid = principalStillRequired ? !!filledOut : true;
  const showInStateChoice = addressRules.registeredAgentAddressMustBeInState;
  const raPrice = formatCurrency(stateRule.registeredAgent.renewalCents);

  // Foreign-registration callout: shown when the principal address is in
  // a state different from the formation state. We do NOT block submission.
  // Many owners operate out of state and use a registered agent inside the
  // formation state. We just inform them.
  const principalState = (address.state || filingState).toUpperCase();
  const isOutOfState = !!address.street1.trim() && principalState !== filingState;

  const onContinue = () => {
    const eventProperties = addressStepCompletedProperties(filingState, noFloridaAddress);
    run(
      async () => {
        const res = await saveStep4({
          filingId: filing.id,
          address,
          noFloridaAddress: showInStateChoice ? noFloridaAddress : false,
        });
        if (!res.ok) return { ok: false, error: res.error };
        router.push(`/wizard/${filing.id}/5`);
      },
      WIZARD_ACTION_TIMEOUT_MS,
      eventProperties,
    );
  };

  return (
    <div className="space-y-5">
      {showInStateChoice && (
        <div
          role="radiogroup"
          aria-label={t('addressChoiceLegend', { state: stateRule.name })}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!noFloridaAddress}
            onClick={() => setNoFloridaAddress(false)}
            className={cn(
              'text-left rounded-2xl border-2 p-4 transition-all',
              !noFloridaAddress
                ? 'border-primary bg-primary/5 shadow-glow'
                : 'border-border bg-white hover:border-primary/30',
            )}
          >
            <p className="font-semibold text-ink leading-snug">
              <span key="has-in-state">{t('hasInStateAddress', { state: stateRule.name })}</span>
            </p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={noFloridaAddress}
            onClick={() => setNoFloridaAddress(true)}
            className={cn(
              'text-left rounded-2xl border-2 p-4 transition-all',
              noFloridaAddress
                ? 'border-primary bg-primary/5 shadow-glow'
                : 'border-border bg-white hover:border-primary/30',
            )}
          >
            <p className="font-semibold text-ink leading-snug flex items-start gap-2">
              <span key="no-in-state-icon" className="inline-flex">
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              </span>
              <span key="no-in-state">{t('noInStateAddress', { state: stateRule.name })}</span>
            </p>
          </button>
        </div>
      )}

      {showInStateChoice && noFloridaAddress && (
        <p className="text-sm text-ink-muted leading-relaxed">
          <span key="no-in-state-help">{t('noInStateAddressHelper', { state: stateRule.name })}</span>
        </p>
      )}

      {showInStateChoice && noFloridaAddress && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium text-ink">
            <span key="ra-name">{t('addOnName_registered_agent')}</span>
          </p>
          <p className="text-xs leading-relaxed text-ink-muted mt-1">
            <span key="ra-desc">{t('addOnDesc_registered_agent')}</span>
          </p>
          <ul className="text-xs text-ink-muted space-y-1 mt-2">
            <li><span key="ra-p1">· {t('useOurAgentP1', { state: stateRule.name })}</span></li>
            <li><span key="ra-p2">· {t('useOurAgentP2')}</span></li>
            <li><span key="ra-p3">· {t('useOurAgentP3', { price: raPrice })}</span></li>
            <li><span key="ra-p4">· {t('useOurAgentP4')}</span></li>
          </ul>
        </div>
      )}

      <AddressForm
        value={address}
        onChange={setAddress}
        showInCareOf
        defaultStateCode={filingState}
        highlightMissing={showMissing && principalStillRequired}
      />
      {showMissing && principalStillRequired && !valid && (
        <p className="text-sm text-destructive">
          <span key="missing-fields">{t('missingFields')}</span>
        </p>
      )}

      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink mb-1 flex items-center gap-1.5">
          <span key="principal-tip-icon" className="inline-flex">
            <MapPin className="h-4 w-4" />
          </span>
          <span key="principal-tip-title">{t('principalTipTitle')}</span>
        </p>
        <p className="text-xs leading-relaxed">
          <span key="principal-tip-body">
            {principalRequired
              ? t('principalTipBody', { state: stateRule.name })
              : t('principalTipBodyOptional', { state: stateRule.name })}
          </span>
        </p>
      </div>

      {isOutOfState && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
            <span key="foreign-icon" className="inline-flex">
              <Info className="h-4 w-4" />
            </span>
            <span key="foreign-title">{t('foreignRegistrationCalloutTitle')}</span>
          </p>
          <p className="text-xs leading-relaxed text-amber-900/80">
            <span key="foreign-body">{t('foreignRegistrationCalloutBody', { filingState: stateRule.name })}</span>
          </p>
        </div>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/3`}
        onNext={onContinue}
        nextDisabled={!valid}
        onBlocked={() => setShowMissing(true)}
        pending={pending}
        error={error}
      />
    </div>
  );
}
