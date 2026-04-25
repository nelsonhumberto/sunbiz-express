'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveStep2 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { NameCheckWidget, type NameCheckResult } from '../NameCheckWidget';
import { hasLLCSuffix, hasCorpSuffix } from '@/lib/florida';
import type { WizardFiling } from '../types';

export function Step2Name({ filing }: { filing: WizardFiling }) {
  const [name, setName] = useState(filing.businessName ?? '');
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const suffixOk =
    filing.entityType === 'LLC' ? hasLLCSuffix(name) : hasCorpSuffix(name);
  const canContinue = name.trim().length >= 2 && suffixOk;

  const onContinue = () => {
    if (!canContinue) return;
    start(async () => {
      const res = await saveStep2({
        filingId: filing.id,
        businessName: name,
        available: result?.available ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save name');
        return;
      }
      if (result && !result.available) {
        const proceed = window.confirm(
          'This name may not be distinguishable on the Florida record. Continuing means the state may reject your filing. Use the suggested alternatives?'
        );
        if (!proceed) return;
      }
      router.push(`/wizard/${filing.id}/3`);
    });
  };

  return (
    <div className="space-y-6">
      <NameCheckWidget
        initialName={filing.businessName}
        entityType={filing.entityType as 'LLC' | 'CORP'}
        onChange={(n, r) => {
          setName(n);
          setResult(r);
        }}
      />

      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-ink-muted leading-relaxed">
        <p className="font-medium text-ink mb-1">Quick tips for a strong name</p>
        <ul className="space-y-1 text-xs">
          <li>· Make it distinctive on the Florida record (not just punctuation differences)</li>
          <li>· Keep it under 70 characters for easier marketing</li>
          <li>· Check the matching .com domain availability — you can buy one in the next steps</li>
          <li>· Avoid restricted words (Bank, Trust, Insurance) without regulatory approval</li>
        </ul>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/1`}
        onNext={onContinue}
        nextDisabled={!canContinue}
        pending={pending}
      />
    </div>
  );
}
