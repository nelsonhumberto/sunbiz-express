'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CreditCard, ShieldCheck, CalendarClock, Loader2 } from 'lucide-react';
import { renewRegisteredAgent } from '@/actions/registered-agent';
import { StripeCardInput, type StripeCardHandle } from '@/components/ui/StripeCardInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDateLong } from '@/lib/utils';

export type RaSavedCard = {
  last4: string;
  brand: string;
  cardholderName: string;
  paymentMethodId?: string;
};

export type RenewRegisteredAgentFormProps = {
  raServiceId: string;
  companyName: string;
  agentAddress: string;
  currentRenewalDate: string;
  newRenewalDate: string;
  renewalPriceCents: number;
  savedCard: RaSavedCard | null;
};

export function RenewRegisteredAgentForm(props: RenewRegisteredAgentFormProps) {
  const t = useTranslations('dashboard');
  const router = useRouter();

  const hasSaved = !!props.savedCard;
  const [useSavedCard, setUseSavedCard] = useState(hasSaved);
  const [cardholderName, setCardholderName] = useState(
    hasSaved ? props.savedCard!.cardholderName : '',
  );
  const cardRef = useRef<StripeCardHandle>(null);
  const [pending, start] = useTransition();

  const canSubmit = useSavedCard || cardholderName.trim().length >= 2;

  const onRenew = () => {
    if (!useSavedCard && !cardholderName.trim()) {
      toast.error(t('raRenewCardholderRequired'));
      return;
    }
    start(async () => {
      // Confirm a PaymentIntent for exactly the renewal price. No filingId is
      // passed so the amount isn't bounded to the (larger) formation total.
      const result = await cardRef.current!.confirm({
        amountCents: props.renewalPriceCents,
        cardholderName: useSavedCard ? props.savedCard!.cardholderName : cardholderName,
        savedPaymentMethodId: useSavedCard ? props.savedCard!.paymentMethodId : undefined,
      });
      if ('error' in result) {
        toast.error(result.error);
        return;
      }

      const res = await renewRegisteredAgent({
        raServiceId: props.raServiceId,
        paymentIntentId: result.paymentIntentId,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('raRenewGenericError'));
        return;
      }
      toast.success(t('raRenewSuccess'));
      router.push(`/dashboard/billing`);
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardContent className="p-5 space-y-3">
          <SummaryRow label={t('raRenewCompany')} value={props.companyName} />
          <SummaryRow label={t('raRenewAgentAddress')} value={props.agentAddress} />
          <SummaryRow
            label={t('raRenewCurrentRenewal')}
            value={formatDateLong(props.currentRenewalDate)}
          />
          <SummaryRow
            label={t('raRenewNewRenewal')}
            value={formatDateLong(props.newRenewalDate)}
            icon={<CalendarClock className="h-3.5 w-3.5 text-primary" />}
          />
          <div className="border-t border-border pt-3 flex items-baseline justify-between">
            <span className="font-semibold">{t('raRenewPrice')}</span>
            <span className="font-display text-2xl font-medium">
              {formatCurrency(props.renewalPriceCents)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-semibold text-ink flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t('raRenewCardDetails')}
          </h3>

          {hasSaved && (
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="ra-card"
                  checked={useSavedCard}
                  onChange={() => setUseSavedCard(true)}
                  className="accent-primary"
                />
                <span>
                  {t('raRenewUseSavedCard')} - {' '}
                  <span className="font-medium">
                    {props.savedCard!.brand} •••• {props.savedCard!.last4}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="ra-card"
                  checked={!useSavedCard}
                  onChange={() => setUseSavedCard(false)}
                  className="accent-primary"
                />
                <span>{t('raRenewNewCard')}</span>
              </label>
            </div>
          )}

          {!useSavedCard && (
            <>
              <div className="space-y-1.5">
                <Label>{t('raRenewCardholder')}</Label>
                <Input
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  autoComplete="cc-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('raRenewCardDetails')}</Label>
                <StripeCardInput ref={cardRef} />
              </div>
            </>
          )}

          {/* Saved-card path still needs a mounted Elements provider for
              confirmCardPayment; render it hidden without the CardElement. */}
          {useSavedCard && <StripeCardInput ref={cardRef} showCardElement={false} />}

          <p className="text-xs text-ink-muted leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            {t('raRenewConsent')}
          </p>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full"
        onClick={onRenew}
        disabled={pending || !canSubmit}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          t('raRenewPay', { amount: formatCurrency(props.renewalPriceCents) })
        )}
      </Button>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-right inline-flex items-center gap-1.5">
        {icon}
        {value}
      </span>
    </div>
  );
}
