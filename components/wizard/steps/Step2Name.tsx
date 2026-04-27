'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { saveStep2 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { NameCheckWidget, type NameCheckResult } from '../NameCheckWidget';
import type { WizardFiling } from '../types';

export function Step2Name({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const [name, setName] = useState(filing.businessName ?? '');
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // The name widget owns the suffix dropdown so the suffix is always valid;
  // only gate Continue on having an actual base name (>= 2 chars) here.
  const canContinue = name.trim().length >= 2;

  const onContinue = () => {
    if (!canContinue) return;
    start(async () => {
      const res = await saveStep2({
        filingId: filing.id,
        businessName: name,
        available: result?.available ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('errorSaveGeneric'));
        return;
      }
      if (result && !result.available) {
        const proceed = window.confirm(t('confirmNotAvailable'));
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
        <p className="font-medium text-ink mb-1">{t('nameTipsTitle')}</p>
        <ul className="space-y-1 text-xs">
          <li>· {t('nameTip1')}</li>
          <li>· {t('nameTip2')}</li>
          <li>· {t('nameTip3')}</li>
          <li>· {t('nameTip4')}</li>
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
