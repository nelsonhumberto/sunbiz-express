'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import {
  Lock,
  CreditCard,
  ShieldCheck,
  Building2,
  CheckCircle2,
  FileText,
  CalendarClock,
  Tag,
  Loader2,
  X,
  FlaskConical,
} from 'lucide-react';
import { processCheckout } from '@/actions/payments';
import { validateCoupon, type CouponValidationResult } from '@/actions/coupons';
import { WizardActions } from '../WizardShell';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  computeCost,
  RA_RENEWAL_PRICE_CENTS,
  type AddOnSlug,
  type TierSlug,
  TIER_BY_SLUG,
} from '@/lib/pricing';
import { localizedLineLabel, localizedLineDetail } from '../CostSidebar';
import { formatCurrency, safeParseJson } from '@/lib/utils';
import type { WizardFiling } from '../types';
import { filingIncludesEin } from '@/lib/ein';
import {
  getFormationState,
  isActiveFormationState,
  type StateCode,
} from '@/lib/formation-states';
import {
  EinResponsiblePartyPanel,
  type EinPanelInitialState,
} from '../EinResponsiblePartyPanel';

export function Step12Payment({
  filing,
  einInitial,
  defaultEmail,
  defaultName,
  isTester = false,
}: {
  filing: WizardFiling;
  einInitial: EinPanelInitialState;
  defaultEmail?: string;
  defaultName?: string;
  isTester?: boolean;
}) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');
  const locale = useLocale();

  const entityType = filing.entityType as 'LLC' | 'CORP';
  const stateCode: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateName = getFormationState(stateCode).name;
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const optionalDetails = safeParseJson<Record<string, unknown> | null>(
    filing.optionalDetails,
    null,
  );
  const processingOptionId =
    optionalDetails && typeof optionalDetails.processingOption === 'string'
      ? (optionalDetails.processingOption as string)
      : undefined;
  const breakdown = computeCost({
    entityType,
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
    state: stateCode,
    processingOptionId,
  });
  const tier = TIER_BY_SLUG[filing.serviceTier as TierSlug];

  const einRequired = filingIncludesEin({
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });
  const [einComplete, setEinComplete] = useState(einInitial.collected);

  // Registered Agent auto-renew: only offer it when the customer chose our RA.
  const registeredAgent = safeParseJson<{ useOurService?: boolean } | null>(
    filing.registeredAgent,
    null,
  );
  const usesOurRa = registeredAgent?.useOurService === true;

  const [cardholderName, setCardholderName] = useState(filing.incorporatorSignature ?? '');
  // Default the auto-renew mandate to on, with the full terms shown inline so
  // it's affirmative, informed consent (not a hidden pre-check).
  const [autoRenewRa, setAutoRenewRa] = useState(true);
  // First renewal charge date - one year out. Computed once so SSR and the
  // client render the same string (no hydration mismatch).
  const [firstRenewalDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  });
  const [pending, start] = useTransition();
  const router = useRouter();
  const cardRef = useRef<StripeCardHandle>(null);

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [couponPending, startCoupon] = useTransition();
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [couponError, setCouponError] = useState('');

  const discountCents = appliedCoupon?.discountCents ?? 0;
  const finalTotal = Math.max(0, breakdown.totalCents - discountCents);

  const applyCode = () => {
    if (!couponInput.trim()) return;
    setCouponError('');
    startCoupon(async () => {
      const result = await validateCoupon(couponInput, breakdown.totalCents);
      if (result.ok) {
        setAppliedCoupon(result);
        setCouponInput('');
      } else {
        setCouponError(result.error ?? 'Invalid coupon.');
      }
    });
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
    setCouponInput('');
  };

  const onPay = () => {
    if (einRequired && !einComplete) {
      toast.error(t('einRequiredBeforePayment'));
      return;
    }
    start(async () => {
      let paymentIntentId: string;

      if (isTester) {
        // Tester mode: skip Stripe entirely, use bypass sentinel
        paymentIntentId = 'TESTER_BYPASS';
      } else {
        if (!cardholderName.trim()) {
          toast.error(t('errorCardholder'));
          return;
        }
        const result = await cardRef.current!.confirm({
          amountCents: finalTotal,
          cardholderName,
          filingId: filing.id,
        });
        if ('error' in result) {
          toast.error(result.error);
          return;
        }
        paymentIntentId = result.paymentIntentId;
      }

      const res = await processCheckout({
        filingId: filing.id,
        paymentIntentId,
        couponId: appliedCoupon?.couponId,
        couponCode: appliedCoupon?.code,
        discountCents,
        autoRenewRa: usesOurRa && autoRenewRa,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.redirectTo) router.push(res.redirectTo);
    });
  };

  return (
    <div className="space-y-5">
      {/* Order Summary - single all-in package + selected add-ons. */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="font-semibold text-ink mb-3">{t('orderSummary')}</h3>
        <div className="space-y-2.5">
          {breakdown.lines.map((line) => {
            const label = localizedLineLabel(line, entityType, t, tPricing);
            const detail = localizedLineDetail(line, t);
            return (
              <div key={line.key} className="flex items-baseline justify-between text-sm gap-3">
                <div className="min-w-0">
                  <p className="text-ink leading-snug">{label}</p>
                  {detail && (
                    <p className="text-xs text-ink-subtle leading-snug">{detail}</p>
                  )}
                </div>
                <span className="font-medium shrink-0">
                  {formatCurrency(line.cents, { showZero: true })}
                </span>
              </div>
            );
          })}
        </div>
        {/* Discount line */}
        {discountCents > 0 && appliedCoupon && (
          <div className="flex items-baseline justify-between text-sm gap-3 text-success">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              <span>Coupon <strong>{appliedCoupon.code}</strong>
                {appliedCoupon.type === 'PERCENT' ? ` (${appliedCoupon.value}% off)` : ''}
              </span>
            </div>
            <span className="font-medium shrink-0">−{formatCurrency(discountCents)}</span>
          </div>
        )}

        <div className="border-t border-border mt-4 pt-4 flex items-baseline justify-between">
          <span className="font-semibold">{t('total')}</span>
          <div className="text-right">
            {discountCents > 0 && (
              <p className="text-sm text-ink-subtle line-through">{formatCurrency(breakdown.totalCents, { showZero: true })}</p>
            )}
            <span className="font-display text-2xl font-medium">
              {formatCurrency(finalTotal, { showZero: true })}
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-subtle leading-snug">{t('packageDisclosure')}</p>

        {/* Coupon code input */}
        <div className="border-t border-border pt-4 mt-2">
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-md bg-success/10 border border-success/20 px-3 py-2 text-sm text-success">
              <span className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                <strong>{appliedCoupon.code}</strong> applied
                {appliedCoupon.description && <span className="text-xs opacity-70"> - {appliedCoupon.description}</span>}
              </span>
              <button type="button" onClick={removeCoupon} className="hover:opacity-70">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-ink-muted flex items-center gap-1"><Tag className="h-3 w-3" /> Have a coupon code?</p>
              <div className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyCode())}
                  placeholder="LAUNCHXX"
                  className="uppercase tracking-widest font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyCode}
                  disabled={couponPending || !couponInput.trim()}
                  className="shrink-0"
                >
                  {couponPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
                </Button>
              </div>
              {couponError && <p className="text-xs text-destructive">{couponError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* The responsible party is normally collected on the add-ons step
          (the screen before this one). This renders only as a fallback when
          the customer reached payment without completing it (e.g. via "Skip
          to payment" before that gate, or an older in-flight draft). */}
      {einRequired && !einInitial.collected && (
        <EinResponsiblePartyPanel
          filingId={filing.id}
          initial={einInitial}
          defaultEmail={defaultEmail}
          defaultName={defaultName}
          onSaved={() => setEinComplete(true)}
        />
      )}

      {/* What happens after payment - calms anxiety, keeps customer oriented. */}
      <div className="rounded-lg border border-border bg-paper-soft p-5">
        <h3 className="font-semibold text-ink mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {t('afterPaymentHeadline')}
        </h3>
        <ol className="space-y-2.5 text-sm">
          <Timeline
            icon={<Building2 className="h-3.5 w-3.5" />}
            text={t('afterPaymentStep1', { state: stateName })}
          />
          <Timeline
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            text={t('afterPaymentStep2', { state: stateName })}
          />
          <Timeline icon={<FileText className="h-3.5 w-3.5" />} text={t('afterPaymentStep3')} />
          <Timeline
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            text={t('afterPaymentStep4')}
          />
        </ol>
      </div>

      {/* Card form / Tester bypass */}
      {isTester ? (
        <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 font-semibold">
            <FlaskConical className="h-5 w-5" />
            Test Mode - no real charge will be made
          </div>
          <p className="text-sm text-amber-700 leading-snug">
            Your account is flagged as a tester. Click <strong>Pay</strong> to simulate a successful
            payment and run the full workflow - document generation, emails, and filing submission - 
            without charging any card.
          </p>
          <div className="rounded-md border border-amber-300 bg-white px-4 py-3 text-sm font-mono text-ink-muted flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-amber-400 shrink-0" />
            Test card •••• •••• •••• 4242 · No charge
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-ink flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t('paymentDetails')}
            </h3>
            <span className="inline-flex items-center gap-1 text-xs text-ink-subtle">
              <Lock className="h-3 w-3" /> {t('stripeBadge')}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>{t('cardholderName')}</Label>
            <Input
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
              placeholder={tier?.name ?? ''}
              autoComplete="cc-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Card details</Label>
            <StripeCardInput ref={cardRef} />
          </div>
        </div>
      )}

      {/* Registered Agent auto-renew mandate - affirmative, informed consent
          with the amount, date, cadence, and cancel path shown inline. Only
          when the customer chose our RA and there's a real charge to renew. */}
      {usesOurRa && !isTester && (
        <label className="flex items-start gap-3 rounded-lg border border-border bg-paper-soft p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRenewRa}
            onChange={(e) => setAutoRenewRa(e.target.checked)}
            className="mt-0.5 accent-primary h-4 w-4 shrink-0"
          />
          <span className="text-sm leading-relaxed">
            <span className="font-medium text-ink flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {t('raAutoRenewLabel')}
            </span>
            <span className="mt-1 block text-xs text-ink-muted">
              {t('raAutoRenewMandate', {
                price: formatCurrency(RA_RENEWAL_PRICE_CENTS),
                date: new Intl.DateTimeFormat(locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }).format(firstRenewalDate),
              })}
            </span>
          </span>
        </label>
      )}

      {/* Trust footer */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          {t('pciCompliant')}
        </span>
        <span>·</span>
        <span>{t('sslEncrypted')}</span>
        <span>·</span>
        <span>{t('refundPolicy')}</span>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/10`}
        onNext={onPay}
        pending={pending}
        nextDisabled={!isTester && einRequired && !einComplete}
        nextLabel={t('pay', {
          amount: formatCurrency(finalTotal, { showZero: true }),
        })}
      />
    </div>
  );
}

function Timeline({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </span>
      <span className="text-ink leading-snug">{text}</span>
    </li>
  );
}
