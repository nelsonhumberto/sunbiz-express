'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, MapPin } from 'lucide-react';
import { saveStep5 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { Label } from '@/components/ui/label';
import { cn, safeParseJson } from '@/lib/utils';
import { isActiveFormationState, type StateCode } from '@/lib/formation-states';
import type { WizardFiling } from '../types';

export function Step5Mailing({ filing }: { filing: WizardFiling }) {
  const filingState: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const principal = safeParseJson<AddressValue>(filing.principalAddress, {
    street1: '',
    city: '',
    state: filingState,
    zip: '',
  });

  const stored = safeParseJson<unknown>(filing.mailingAddress, null);
  const initialSame = stored === 'SAME_AS_PRINCIPAL' || stored === null;
  const initialAddress: AddressValue =
    !initialSame && typeof stored === 'object' && stored !== null
      ? (stored as AddressValue)
      : { street1: '', city: '', state: filingState, zip: '' };

  const [sameAsPrincipal, setSame] = useState(initialSame);
  const [address, setAddress] = useState<AddressValue>(initialAddress);
  const [showMissing, setShowMissing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const valid = !!(
    sameAsPrincipal ||
    (address.street1.trim() && address.city.trim() && address.state && address.zip.trim())
  );

  const onContinue = () => {
    start(async () => {
      const res = await saveStep5({
        filingId: filing.id,
        sameAsPrincipal,
        address: sameAsPrincipal ? undefined : address,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/6`);
    });
  };

  return (
    <div className="space-y-5">
      {/* Prominent same-as-principal card: a large clickable tile with a
          checkmark indicator so the autofill option is the obvious default,
          not a hidden button. */}
      <button
        type="button"
        onClick={() => setSame((s) => !s)}
        aria-pressed={sameAsPrincipal}
        className={cn(
          'w-full text-left rounded-2xl border-2 p-5 transition-all flex gap-4 items-start',
          sameAsPrincipal
            ? 'border-primary bg-primary/5 shadow-glow'
            : 'border-border bg-white hover:border-primary/40 hover:shadow-card',
        )}
      >
        <div
          className={cn(
            'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
            sameAsPrincipal ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
          )}
        >
          {sameAsPrincipal ? (
            <Check className="h-5 w-5" strokeWidth={3} />
          ) : (
            <MapPin className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink leading-snug">
            Use the same address as my principal office
          </p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">
            {principal.street1 ? (
              <>
                {principal.street1}
                {principal.street2 ? `, ${principal.street2}` : ''}, {principal.city},{' '}
                {principal.state} {principal.zip}
              </>
            ) : (
              'We will reuse the address you entered in the previous step.'
            )}
          </p>
        </div>
      </button>

      {!sameAsPrincipal && (
        <div className="space-y-3">
          <Label className="text-base">Mailing address</Label>
          <AddressForm
            value={address}
            onChange={setAddress}
            defaultStateCode={filingState}
            highlightMissing={showMissing}
          />
          <p className="text-xs text-ink-muted">
            Mailing addresses can be a P.O. Box. Government correspondence will be sent here.
          </p>
        </div>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/4`}
        onNext={onContinue}
        nextDisabled={!valid}
        onBlocked={() => setShowMissing(true)}
        pending={pending}
      />
    </div>
  );
}
