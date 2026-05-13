'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Info, MapPin } from 'lucide-react';
import { saveStep4 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { safeParseJson } from '@/lib/utils';
import {
  isActiveFormationState,
  getFormationState,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';

export function Step4Address({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const filingState: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateRule = getFormationState(filingState);
  const addressRules = stateRule.addressRules;

  const initial = safeParseJson<AddressValue>(filing.principalAddress, {
    street1: '',
    city: '',
    state: filingState,
    zip: '',
  });
  const [address, setAddress] = useState<AddressValue>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const principalRequired = addressRules.principalAddressRequired;
  const filledOut =
    address.street1.trim() &&
    address.city.trim() &&
    address.state &&
    address.zip.trim();
  const valid = principalRequired ? filledOut : true;

  // Foreign-registration callout: shown when the principal address is in
  // a state different from the formation state. We do NOT block submission —
  // many owners legitimately operate out-of-state and use a registered
  // agent inside the formation state. We just inform them.
  const principalState = (address.state || filingState).toUpperCase();
  const isOutOfState = !!address.street1.trim() && principalState !== filingState;

  const onContinue = () => {
    start(async () => {
      const res = await saveStep4({ filingId: filing.id, address });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/5`);
    });
  };

  return (
    <div className="space-y-5">
      <AddressForm
        value={address}
        onChange={setAddress}
        showInCareOf
        defaultStateCode={filingState}
      />

      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink mb-1 flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          {t('principalTipTitle')}
        </p>
        <p className="text-xs leading-relaxed">
          {principalRequired
            ? t('principalTipBody', { state: stateRule.name })
            : t('principalTipBodyOptional', { state: stateRule.name })}
        </p>
      </div>

      {isOutOfState && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
            <Info className="h-4 w-4" />
            {t('foreignRegistrationCalloutTitle')}
          </p>
          <p className="text-xs leading-relaxed text-amber-900/80">
            {t('foreignRegistrationCalloutBody', { filingState: stateRule.name })}
          </p>
        </div>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/3`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
