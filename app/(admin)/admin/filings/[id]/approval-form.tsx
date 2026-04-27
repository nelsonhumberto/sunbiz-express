'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { advanceFilingStatus } from '@/actions/admin';

export function AdminApprovalForm({
  filingId,
  status,
  entityType,
  currentSunbizNumber,
}: {
  filingId: string;
  status: string;
  entityType: 'LLC' | 'CORP';
  currentSunbizNumber: string | null;
}) {
  const t = useTranslations('admin');
  const [filingNumber, setFilingNumber] = useState(currentSunbizNumber ?? '');
  const [pending, start] = useTransition();

  // Sunbiz format: one letter (L for LLC, P for profit corp) followed by 11
  // digits, e.g. L26000123456. Hint to the admin so typos don't slip through.
  const expectedPrefix = entityType === 'LLC' ? 'L' : 'P';
  const formatOk = /^[A-Z][0-9]{11}$/.test(filingNumber.trim());

  const onSubmit = (next: 'submit' | 'approve') => {
    start(async () => {
      try {
        if (next === 'approve' && !formatOk) {
          toast.error(t('filingNumberFormatBad'));
          return;
        }
        await advanceFilingStatus(filingId, {
          sunbizFilingNumber: next === 'approve' ? filingNumber.trim() : undefined,
        });
        toast.success(next === 'approve' ? t('filingApproved') : t('filingAdvanced'));
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  if (status === 'DRAFT') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{t('stateApprovalForceSubmitDesc')}</p>
        <Button variant="outline" disabled={pending} onClick={() => onSubmit('submit')}>
          {pending ? t('submitting') : t('forceSubmit')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">{t('stateApprovalIntro')}</p>
      <div className="space-y-1.5 max-w-md">
        <Label htmlFor="sunbizFilingNumber">
          {t('sunbizFilingNumberLabel')}{' '}
          <span className="text-ink-subtle font-normal text-xs">
            {t('sunbizFilingNumberFormatHint', { prefix: expectedPrefix })}
          </span>
        </Label>
        <Input
          id="sunbizFilingNumber"
          value={filingNumber}
          onChange={(e) => setFilingNumber(e.target.value.toUpperCase())}
          placeholder={`${expectedPrefix}26000000000`}
          className="font-mono"
          maxLength={12}
        />
        {filingNumber.length > 0 && !formatOk && (
          <p className="text-xs text-amber-700">{t('sunbizFilingNumberFormatBad')}</p>
        )}
        {filingNumber.length > 0 && formatOk && filingNumber[0] !== expectedPrefix && (
          <p className="text-xs text-amber-700">
            {t.rich('sunbizPrefixHint', {
              entity: entityType,
              prefix: expectedPrefix,
              code: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !formatOk} onClick={() => onSubmit('approve')}>
          {pending ? t('approving') : t('approveFiling')}
        </Button>
      </div>
    </div>
  );
}
