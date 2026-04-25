'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveStep5 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { safeParseJson } from '@/lib/utils';
import type { WizardFiling } from '../types';

export function Step5Mailing({ filing }: { filing: WizardFiling }) {
  const principal = safeParseJson<AddressValue>(filing.principalAddress, {
    street1: '',
    city: '',
    state: 'FL',
    zip: '',
  });

  const stored = safeParseJson<unknown>(filing.mailingAddress, null);
  const initialSame = stored === 'SAME_AS_PRINCIPAL' || stored === null;
  const initialAddress: AddressValue =
    !initialSame && typeof stored === 'object' && stored !== null
      ? (stored as AddressValue)
      : { street1: '', city: '', state: 'FL', zip: '' };

  const [sameAsPrincipal, setSame] = useState(initialSame);
  const [address, setAddress] = useState<AddressValue>(initialAddress);
  const [pending, start] = useTransition();
  const router = useRouter();

  const valid =
    sameAsPrincipal ||
    (address.street1.trim() && address.city.trim() && address.state && address.zip.trim());

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
      <label className="flex items-start gap-3 p-4 rounded-lg border-2 border-border bg-white cursor-pointer hover:border-primary/30 transition-colors">
        <Checkbox
          checked={sameAsPrincipal}
          onCheckedChange={(v) => setSame(!!v)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <p className="font-medium text-ink leading-snug">
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
              'Same as the address you entered in the previous step.'
            )}
          </p>
        </div>
      </label>

      {!sameAsPrincipal && (
        <div className="space-y-3">
          <Label className="text-base">Mailing address</Label>
          <AddressForm value={address} onChange={setAddress} />
          <p className="text-xs text-ink-muted">
            Mailing addresses can be a P.O. Box. Government correspondence will be sent here.
          </p>
        </div>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/4`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
