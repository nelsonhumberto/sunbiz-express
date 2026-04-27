'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarRange } from 'lucide-react';
import { saveStep9 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { safeParseJson } from '@/lib/utils';
import { isValidEffectiveDate } from '@/lib/florida';
import type { WizardFiling } from '../types';

export function Step9Optional({ filing }: { filing: WizardFiling }) {
  const stored = safeParseJson<{
    effectiveDate?: string;
    authorizedShares?: number;
    professionalPurpose?: string;
    businessPurpose?: string;
  } | null>(filing.optionalDetails, null);

  const [effectiveDate, setEffectiveDate] = useState(stored?.effectiveDate?.slice(0, 10) ?? '');
  const [authorizedShares, setAuthorizedShares] = useState<number | ''>(
    stored?.authorizedShares ?? (filing.entityType === 'CORP' ? 1000 : '')
  );
  const [businessPurpose, setBusinessPurpose] = useState(stored?.businessPurpose ?? '');

  const [pending, start] = useTransition();
  const router = useRouter();

  // Validate date
  let dateError: string | undefined;
  if (effectiveDate) {
    const v = isValidEffectiveDate(new Date(effectiveDate));
    if (!v.valid) dateError = v.error;
  }

  const valid =
    !dateError &&
    (filing.entityType !== 'CORP' || (typeof authorizedShares === 'number' && authorizedShares >= 1));

  const onContinue = () => {
    start(async () => {
      const res = await saveStep9({
        filingId: filing.id,
        effectiveDate: effectiveDate || undefined,
        authorizedShares:
          filing.entityType === 'CORP' && typeof authorizedShares === 'number'
            ? authorizedShares
            : undefined,
        businessPurpose: businessPurpose || undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not save');
        return;
      }
      router.push(`/wizard/${filing.id}/9`);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-white p-5 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="effectiveDate" className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Effective date <span className="text-ink-subtle font-normal">(optional)</span>
          </Label>
          <Input
            id="effectiveDate"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="max-w-xs"
          />
          {dateError ? (
            <p className="text-xs text-destructive">{dateError}</p>
          ) : (
            <p className="text-xs text-ink-muted">
              Florida lets you backdate up to 5 business days or schedule up to 90 days in the
              future. Leave blank to use the date Florida processes the filing.
              <br />
              <strong>Tip:</strong> If forming Oct 1 – Dec 31, set the effective date to January 1
              of next year — you'll skip a full year of annual reports.
            </p>
          )}
        </div>

        {filing.entityType === 'CORP' && (
          <div className="space-y-1.5">
            <Label htmlFor="shares">
              Authorized shares <span className="text-destructive">*</span>
            </Label>
            <Input
              id="shares"
              type="number"
              min={1}
              value={authorizedShares}
              onChange={(e) =>
                setAuthorizedShares(e.target.value ? parseInt(e.target.value, 10) : '')
              }
              className="max-w-xs"
            />
            <p className="text-xs text-ink-muted">
              The number of shares your corporation is authorized to issue. Most early-stage
              companies start with 1,000–10,000,000.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="purpose">
            Business purpose <span className="text-ink-subtle font-normal">(optional)</span>
          </Label>
          <Textarea
            id="purpose"
            value={businessPurpose}
            onChange={(e) => setBusinessPurpose(e.target.value)}
            placeholder="Real estate investment and consulting"
            maxLength={500}
            rows={2}
          />
          <p className="text-xs text-ink-muted">
            A brief description of what your business will do. Most LLCs leave this blank or write
            "any lawful business activity."
          </p>
        </div>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/7`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
