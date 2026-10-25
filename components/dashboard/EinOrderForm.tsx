'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CreditCard, ShieldCheck, Loader2 } from 'lucide-react';
import { purchaseEinAddOn } from '@/actions/ein';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';

export type EinSavedCard = {
  last4: string;
  brand: string;
  cardholderName: string;
  paymentMethodId: string;
};

export function EinOrderForm(props: {
  filingId: string;
  companyName: string;
  priceCents: number;
  savedCard: EinSavedCard | null;
}) {
  const t = useTranslations('einForm');
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
      // purpose ein prices the catalog fee. The PaymentIntent is not the formation checkout.
      const result = await cardRef.current!.confirm({
        amountCents: props.priceCents,
        filingId: props.filingId,
        purpose: 'ein',
        cardholderName: useSavedCard ? props.savedCard!.cardholderName : cardholderName,
        savedPaymentMethodId: useSavedCard ? props.savedCard!.paymentMethodId : undefined,
      });
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      const res = await purchaseEinAddOn({
        filingId: props.filingId,
        paymentIntentId: result.paymentIntentId,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('orderError'));
        return;
      }
      toast.success(t('orderSuccess'));
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <SummaryRow label={t('orderCompany')} value={props.companyName} />
          <SummaryRow label={t('orderService')} value={t('orderServiceName')} />
          <div className="border-t border-border pt-3 flex items-baseline justify-between">
            <span className="font-semibold">{t('orderPrice')}</span>
            <span className="font-display text-2xl font-medium">
              {formatCurrency(props.priceCents)}
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
                  name="ein-card"
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
                  name="ein-card"
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

          {/* Saved-card path still needs a mounted Elements provider for
              confirmCardPayment; render it hidden without the CardElement. */}
          {useSavedCard && <StripeCardInput ref={cardRef} showCardElement={false} />}

          <p className="text-xs text-ink-muted leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            {t('orderConsent')}
          </p>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={onPay} disabled={pending || !canSubmit}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          t('orderPay', { amount: formatCurrency(props.priceCents) })
        )}
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
