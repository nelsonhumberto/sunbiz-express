'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { purchaseCertificateAddOn } from '@/actions/certificates';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trackAddOnPurchased } from '@/lib/analytics';
import type { CertificateAddOnSlug } from '@/lib/certificate-addons';
import { formatCurrency } from '@/lib/utils';

export type CertificateSavedCard = {
  last4: string;
  brand: string;
  cardholderName: string;
  paymentMethodId: string;
};

export function CertificateOrderForm(props: {
  filingId: string;
  slug: CertificateAddOnSlug;
  companyName: string;
  stateName: string;
  tier: string;
  state: string;
  entityType: string;
  serviceCents: number;
  stateFeeCents: number;
  totalCents: number;
  savedCard: CertificateSavedCard | null;
}) {
  const t = useTranslations('certificates');
  const tCard = useTranslations('dashboard');
  const router = useRouter();

  const hasSaved = !!props.savedCard;
  const [useSavedCard, setUseSavedCard] = useState(hasSaved);
  const [cardholderName, setCardholderName] = useState(props.savedCard?.cardholderName ?? '');
  const cardRef = useRef<StripeCardHandle>(null);
  const [pending, start] = useTransition();

  const canSubmit = useSavedCard || cardholderName.trim().length >= 2;

  const onPay = () => {
    if (!useSavedCard && !cardholderName.trim()) {
      toast.error(tCard('raRenewCardholderRequired'));
      return;
    }
    start(async () => {
      const result = await cardRef.current!.confirm({
        amountCents: props.totalCents,
        filingId: props.filingId,
        certificateSlug: props.slug,
        cardholderName: useSavedCard ? props.savedCard!.cardholderName : cardholderName,
        savedPaymentMethodId: useSavedCard ? props.savedCard!.paymentMethodId : undefined,
      });
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      const res = await purchaseCertificateAddOn({
        filingId: props.filingId,
        slug: props.slug,
        paymentIntentId: result.paymentIntentId,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('error'));
        return;
      }
      trackAddOnPurchased({
        slug: props.slug,
        tier: props.tier,
        state: props.state,
        entityType: props.entityType,
        filingId: props.filingId,
        serviceCents: props.serviceCents,
        stateFeeCents: props.stateFeeCents,
        totalCents: props.totalCents,
      });
      toast.success(t('success'));
      router.push(`/dashboard/filings/${props.filingId}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <SummaryRow label={t('company')} value={props.companyName} />
          <SummaryRow label={t('serviceFee')} value={formatCurrency(props.serviceCents)} />
          <SummaryRow
            label={t('stateFee', { state: props.stateName })}
            value={formatCurrency(props.stateFeeCents)}
          />
          <div className="border-t border-border pt-3 flex items-baseline justify-between">
            <span className="font-semibold">{t('total')}</span>
            <span className="font-display text-2xl font-medium">
              {formatCurrency(props.totalCents)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-ink flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {tCard('raRenewCardDetails')}
          </h3>

          {hasSaved && (
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="certificate-card"
                  checked={useSavedCard}
                  onChange={() => setUseSavedCard(true)}
                  className="accent-primary"
                />
                <span>
                  {tCard('raRenewUseSavedCard')} -{' '}
                  <span className="font-medium">
                    {props.savedCard!.brand} •••• {props.savedCard!.last4}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="certificate-card"
                  checked={!useSavedCard}
                  onChange={() => setUseSavedCard(false)}
                  className="accent-primary"
                />
                <span>{tCard('raRenewNewCard')}</span>
              </label>
            </div>
          )}

          {!useSavedCard && (
            <>
              <div className="space-y-1.5">
                <Label>{tCard('raRenewCardholder')}</Label>
                <Input
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  autoComplete="cc-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tCard('raRenewCardDetails')}</Label>
                <StripeCardInput ref={cardRef} />
              </div>
            </>
          )}

          {useSavedCard && <StripeCardInput ref={cardRef} showCardElement={false} />}

          <p className="text-xs text-ink-muted leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            {t('consent')}
          </p>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={onPay} disabled={pending || !canSubmit}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('pay', { amount: formatCurrency(props.totalCents) })}
      </Button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
