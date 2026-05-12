'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarRange, Mail, Coins, Clock, Globe } from 'lucide-react';
import { saveStep9 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn, safeParseJson } from '@/lib/utils';
import { isValidEffectiveDate } from '@/lib/formation-validation';
import {
  FORMATION_STATES,
  defaultProcessingOption,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';

function formatDollars(cents: number): string {
  if (cents === 0) return 'Included';
  return `$${(cents / 100).toFixed(2)}`;
}

export function Step9Optional({ filing }: { filing: WizardFiling }) {
  const stored = safeParseJson<{
    effectiveDate?: string;
    authorizedShares?: number;
    parValueCents?: number;
    professionalPurpose?: string;
    businessPurpose?: string;
    electronicServiceConsent?: boolean;
    organizerEmail?: string;
    processingOption?: string;
    foreignRegistrationInterest?: boolean;
  } | null>(filing.optionalDetails, null);

  const stateCode = (filing.state ?? 'FL') as StateCode;
  const stateRule = FORMATION_STATES[stateCode] ?? FORMATION_STATES.FL;

  const [effectiveDate, setEffectiveDate] = useState(stored?.effectiveDate?.slice(0, 10) ?? '');
  const [authorizedShares, setAuthorizedShares] = useState<number | ''>(
    stored?.authorizedShares ?? (filing.entityType === 'CORP' ? 1500 : '')
  );
  const [parValueCents, setParValueCents] = useState<number | ''>(stored?.parValueCents ?? 0);
  const [businessPurpose, setBusinessPurpose] = useState(stored?.businessPurpose ?? '');
  const [organizerEmail, setOrganizerEmail] = useState(stored?.organizerEmail ?? '');
  const [electronicServiceConsent, setElectronicServiceConsent] = useState(
    stored?.electronicServiceConsent ?? false,
  );
  // Processing speed selection — defaults to the state's default option
  // (typically "standard" / no extra fee). Only renders if the state offers
  // more than one option.
  const defaultOption = useMemo(() => defaultProcessingOption(stateRule), [stateRule]);
  const [processingOption, setProcessingOption] = useState<string>(
    stored?.processingOption ?? defaultOption.id,
  );
  const [foreignInterest, setForeignInterest] = useState<boolean>(
    stored?.foreignRegistrationInterest ?? false,
  );

  const [pending, start] = useTransition();
  const router = useRouter();

  let dateError: string | undefined;
  if (effectiveDate) {
    const v = isValidEffectiveDate(new Date(effectiveDate), stateCode);
    if (!v.valid) dateError = v.error;
  }

  const needsWyOrganizer = stateRule.quirks.requiresOrganizerEmail;
  const needsWyConsent = stateRule.quirks.requiresElectronicServiceConsent;
  const needsDeStock = stateRule.quirks.requiresParValueForCorp && filing.entityType === 'CORP';

  const valid =
    !dateError &&
    (filing.entityType !== 'CORP' || (typeof authorizedShares === 'number' && authorizedShares >= 1)) &&
    (!needsWyOrganizer || (organizerEmail.trim().length > 0 && /@/.test(organizerEmail))) &&
    (!needsWyConsent || electronicServiceConsent);

  // Surface a soft warning when DE corp's authorized shares would push the
  // filing above the launch-safe minimum fee tier.
  const deStockWarning =
    needsDeStock && typeof authorizedShares === 'number' && authorizedShares > 1500
      ? "Heads up: Delaware's corporation filing fee can rise above the standard $109 when authorized shares exceed 1,500 with no par value. Our team will review and confirm the exact fee before submission."
      : null;

  const onContinue = () => {
    start(async () => {
      const res = await saveStep9({
        filingId: filing.id,
        effectiveDate: effectiveDate || undefined,
        authorizedShares:
          filing.entityType === 'CORP' && typeof authorizedShares === 'number'
            ? authorizedShares
            : undefined,
        parValueCents: needsDeStock && typeof parValueCents === 'number' ? parValueCents : undefined,
        businessPurpose: businessPurpose || undefined,
        electronicServiceConsent: needsWyConsent ? electronicServiceConsent : undefined,
        organizerEmail: needsWyOrganizer ? organizerEmail : undefined,
        processingOption,
        foreignRegistrationInterest: foreignInterest,
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
              {stateCode === 'FL'
                ? "Florida lets you backdate up to 5 business days or schedule up to 90 days in the future. Leave blank to use the date Florida processes the filing."
                : `${stateRule.name} accepts effective dates up to ${stateRule.effectiveDate.maxDaysForward} days in the future. Leave blank to use the date ${stateRule.name} processes the filing.`}
              {stateCode === 'FL' && (
                <>
                  <br />
                  <strong>Tip:</strong> If forming Oct 1 – Dec 31, set the effective date to January 1
                  of next year — you'll skip a full year of annual reports.
                </>
              )}
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

        {needsDeStock && (
          <div className="space-y-1.5">
            <Label htmlFor="parValue" className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Par value per share (USD) <span className="text-ink-subtle font-normal">(optional)</span>
            </Label>
            <Input
              id="parValue"
              type="number"
              step="0.0001"
              min={0}
              value={typeof parValueCents === 'number' ? (parValueCents / 100).toString() : ''}
              onChange={(e) => {
                const dollars = e.target.value ? parseFloat(e.target.value) : 0;
                setParValueCents(Math.round(dollars * 100));
              }}
              className="max-w-xs"
            />
            <p className="text-xs text-ink-muted">
              Delaware corporations specify par value per share. Most early-stage startups use
              $0.0001 (0.01¢) per share. Leave at 0 for no-par-value stock.
            </p>
            {deStockWarning && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
                {deStockWarning}
              </p>
            )}
          </div>
        )}

        {needsWyOrganizer && (
          <div className="space-y-1.5">
            <Label htmlFor="organizerEmail" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Organizer email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="organizerEmail"
              type="email"
              value={organizerEmail}
              onChange={(e) => setOrganizerEmail(e.target.value)}
              placeholder="organizer@yourbusiness.com"
              className="max-w-md"
            />
            <p className="text-xs text-ink-muted">
              Wyoming requires the organizer's email on the Articles. The Secretary of State
              uses this to send filing confirmations.
            </p>
          </div>
        )}

        {needsWyConsent && (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer hover:border-primary/30">
            <input
              type="checkbox"
              checked={electronicServiceConsent}
              onChange={(e) => setElectronicServiceConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              required
            />
            <span className="text-sm text-ink leading-relaxed">
              I consent to receive electronic service of process and Wyoming Secretary of
              State notices on behalf of this entity. <span className="text-destructive">*</span>
            </span>
          </label>
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

      {/*
        Processing speed selector. Hidden when the state only offers a single
        speed (e.g. Florida same-day default) — no need to make customers
        click through a single-choice form.
      */}
      {stateRule.processingOptions.length > 1 && (
        <div className="rounded-lg border border-border bg-white p-5 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-ink">{stateRule.name} processing speed</p>
              <p className="text-xs text-ink-muted mt-0.5">
                State expedite fees are forwarded to {stateRule.name} — we do not mark them up.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stateRule.processingOptions.map((opt) => {
              const selected = processingOption === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProcessingOption(opt.id)}
                  aria-pressed={selected}
                  className={cn(
                    'text-left rounded-lg border-2 p-4 transition-all space-y-1',
                    selected
                      ? 'border-primary bg-primary/5 shadow-glow'
                      : 'border-border bg-white hover:border-primary/30',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink">{opt.label}</span>
                    <span className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-ink-muted')}>
                      {formatDollars(opt.feeCents)}
                      {opt.feeIsProvisional && opt.feeCents > 0 ? '*' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {opt.estimate} · {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
          {stateRule.processingOptions.some((o) => o.feeIsProvisional && o.feeCents > 0) && (
            <p className="text-[11px] text-ink-subtle italic">
              * Provisional state fee — confirmed at submission. We will reach out before charging
              if the actual amount differs.
            </p>
          )}
        </div>
      )}

      {/*
        Foreign-registration interest capture. Forming in WY/DE doesn't grant
        the right to operate in another state — that requires a separate
        "foreign qualification" filing with the operating state. We gather
        interest now and follow up post-formation once the dedicated product
        is live.
      */}
      {stateCode !== 'FL' && (
        <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer hover:border-primary/30">
          <input
            type="checkbox"
            checked={foreignInterest}
            onChange={(e) => setForeignInterest(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <div className="text-sm text-ink leading-relaxed">
            <span className="font-semibold inline-flex items-center gap-1.5">
              <Globe className="h-4 w-4" />
              I plan to operate in another state
            </span>
            <p className="text-xs text-ink-muted mt-1">
              Forming in {stateRule.name} doesn't authorize you to do business in another state.
              Most states require a separate "foreign qualification" filing if you have an office,
              employees, or significant operations there. We'll follow up after formation with help.
            </p>
          </div>
        </label>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/7`}
        onNext={onContinue}
        nextDisabled={!valid}
        pending={pending}
      />
    </div>
  );
}
