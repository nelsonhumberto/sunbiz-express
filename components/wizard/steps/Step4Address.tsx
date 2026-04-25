'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveStep4 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { safeParseJson } from '@/lib/utils';
import type { WizardFiling } from '../types';

export function Step4Address({ filing }: { filing: WizardFiling }) {
  const initial = safeParseJson<AddressValue>(filing.principalAddress, {
    street1: '',
    city: '',
    state: 'FL',
    zip: '',
  });
  const [address, setAddress] = useState<AddressValue>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const valid =
    address.street1.trim() && address.city.trim() && address.state && address.zip.trim();

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
      <AddressForm value={address} onChange={setAddress} showInCareOf />

      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-ink-muted">
        <p className="font-medium text-ink mb-1">📍 Principal place of business</p>
        <p className="text-xs leading-relaxed">
          This is the address where you primarily conduct business. It can be a Florida address or
          out-of-state — Florida only requires the registered agent's address to be in Florida.
        </p>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/3`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
