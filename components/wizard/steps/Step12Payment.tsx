'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Lock,
  CreditCard,
  ShieldCheck,
  Building2,
  CheckCircle2,
  FileText,
  CalendarClock,
} from 'lucide-react';
import { processCheckout } from '@/actions/payments';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { computeCost, type AddOnSlug, type TierSlug, TIER_BY_SLUG } from '@/lib/pricing';
import { localizedLineLabel, localizedLineDetail } from '../CostSidebar';
import { formatCurrency } from '@/lib/utils';
import type { WizardFiling } from '../types';

// Demo mode pre-fills test card data and shows a "(demo mode)" badge so
// developers can run the mock checkout end-to-end. In any production-like
// build (NEXT_PUBLIC_PAYMENTS_DEMO_MODE !== 'true') the form starts blank
// and the trust copy stays neutral — we never want a real customer to see
// "Stripe (mock)" or pre-typed card numbers.
const PAYMENTS_DEMO_MODE = process.env.NEXT_PUBLIC_PAYMENTS_DEMO_MODE === 'true';

export function Step12Payment({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');

  const entityType = filing.entityType as 'LLC' | 'CORP';
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug
  );
  const breakdown = computeCost({
    entityType,
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });
  const tier = TIER_BY_SLUG[filing.serviceTier as TierSlug];

  const [cardNumber, setCardNumber] = useState(PAYMENTS_DEMO_MODE ? '4242 4242 4242 4242' : '');
  const [cardholderName, setCardholderName] = useState(filing.incorporatorSignature ?? '');
  const [expMonth, setExpMonth] = useState(PAYMENTS_DEMO_MODE ? '12' : '');
  const [expYear, setExpYear] = useState(PAYMENTS_DEMO_MODE ? '29' : '');
  const [cvc, setCvc] = useState(PAYMENTS_DEMO_MODE ? '123' : '');
  const [zip, setZip] = useState(PAYMENTS_DEMO_MODE ? '33131' : '');
  const [pending, start] = useTransition();
  const router = useRouter();

  const formatCardNumber = (v: string) =>
    v
      .replace(/\D/g, '')
      .slice(0, 19)
      .replace(/(\d{4})/g, '$1 ')
      .trim();

  const onPay = () => {
    if (cardNumber.replace(/\s+/g, '').length < 13) {
      toast.error(t('errorCardShort'));
      return;
    }
    if (!cardholderName.trim()) {
      toast.error(t('errorCardholder'));
      return;
    }
    start(async () => {
      const res = await processCheckout({
        filingId: filing.id,
        cardNumber,
        cardholderName,
        expMonth,
        expYear,
        cvc,
        zip,
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
      {/* Order Summary — single all-in package + selected add-ons. */}
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
        <div className="border-t border-border mt-4 pt-4 flex items-baseline justify-between">
          <span className="font-semibold">{t('totalToday')}</span>
          <span className="font-display text-2xl font-medium">
            {formatCurrency(breakdown.totalCents, { showZero: true })}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-subtle leading-snug">{t('packageDisclosure')}</p>
      </div>

      {/* What happens after payment — calms anxiety, keeps customer oriented. */}
      <div className="rounded-lg border border-border bg-paper-soft p-5">
        <h3 className="font-semibold text-ink mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          {t('afterPaymentHeadline')}
        </h3>
        <ol className="space-y-2.5 text-sm">
          <Timeline icon={<Building2 className="h-3.5 w-3.5" />} text={t('afterPaymentStep1')} />
          <Timeline icon={<CheckCircle2 className="h-3.5 w-3.5" />} text={t('afterPaymentStep2')} />
          <Timeline icon={<FileText className="h-3.5 w-3.5" />} text={t('afterPaymentStep3')} />
          <Timeline
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            text={t('afterPaymentStep4')}
          />
        </ol>
      </div>

      {/* Card form */}
      <div className="rounded-lg border border-border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t('paymentDetails')}
          </h3>
          <span className="inline-flex items-center gap-1 text-xs text-ink-subtle">
            <Lock className="h-3 w-3" />{' '}
            {PAYMENTS_DEMO_MODE ? t('stripeBadgeDemo') : t('stripeBadge')}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="card">{t('cardNumber')}</Label>
          <Input
            id="card"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="4242 4242 4242 4242"
            inputMode="numeric"
            className="h-12 font-mono"
            autoComplete="cc-number"
          />
          {PAYMENTS_DEMO_MODE && (
            <p className="text-xs text-ink-subtle">
              {t('testCardsHint', {
                success: '4242 4242 4242 4242',
                decline: '4000 0000 0000 0002',
              })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>MM</Label>
            <Input
              value={expMonth}
              onChange={(e) => setExpMonth(e.target.value)}
              maxLength={2}
              autoComplete="cc-exp-month"
            />
          </div>
          <div className="space-y-1.5">
            <Label>YY</Label>
            <Input
              value={expYear}
              onChange={(e) => setExpYear(e.target.value)}
              maxLength={2}
              autoComplete="cc-exp-year"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CVC</Label>
            <Input
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              maxLength={4}
              autoComplete="cc-csc"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <Label>{t('billingZip')}</Label>
            <Input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={10}
              autoComplete="postal-code"
            />
          </div>
        </div>
      </div>

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
        nextLabel={t('pay', {
          amount: formatCurrency(breakdown.totalCents, { showZero: true }),
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
