'use client';

import { useState, useTransition, useRef } from 'react';
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
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { computeCost, type AddOnSlug, type TierSlug, TIER_BY_SLUG } from '@/lib/pricing';
import { localizedLineLabel, localizedLineDetail } from '../CostSidebar';
import { formatCurrency } from '@/lib/utils';
import type { WizardFiling } from '../types';

export function Step12Payment({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');

  const entityType = filing.entityType as 'LLC' | 'CORP';
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const breakdown = computeCost({
    entityType,
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });
  const tier = TIER_BY_SLUG[filing.serviceTier as TierSlug];

  const [cardholderName, setCardholderName] = useState(filing.incorporatorSignature ?? '');
  const [pending, start] = useTransition();
  const router = useRouter();
  const cardRef = useRef<StripeCardHandle>(null);

  const onPay = () => {
    if (!cardholderName.trim()) {
      toast.error(t('errorCardholder'));
      return;
    }
    start(async () => {
      const result = await cardRef.current!.confirm({
        amountCents: breakdown.totalCents,
        cardholderName,
        filingId: filing.id,
      });
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      const res = await processCheckout({
        filingId: filing.id,
        paymentIntentId: result.paymentIntentId,
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
