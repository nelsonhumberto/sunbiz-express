'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, CreditCard, ShieldCheck } from 'lucide-react';
import { processCheckout } from '@/actions/payments';
import { WizardActions } from '../WizardShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import type { WizardFiling } from '../types';

export function Step12Payment({ filing }: { filing: WizardFiling }) {
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug
  );
  const breakdown = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });

  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardholderName, setCardholderName] = useState(filing.incorporatorSignature ?? '');
  const [expMonth, setExpMonth] = useState('12');
  const [expYear, setExpYear] = useState('29');
  const [cvc, setCvc] = useState('123');
  const [zip, setZip] = useState('33131');
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
      toast.error('Enter a valid card number.');
      return;
    }
    if (!cardholderName.trim()) {
      toast.error('Cardholder name is required.');
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
      {/* Order Summary */}
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="font-semibold text-ink mb-3">Order summary</h3>
        <div className="space-y-2">
          {breakdown.lines.map((line, i) => (
            <div key={i} className="flex items-baseline justify-between text-sm gap-3">
              <div className="flex items-center gap-2">
                <span className="text-ink">{line.label}</span>
                {line.category === 'state' && (
                  <Badge variant="outline" size="sm">
                    State fee
                  </Badge>
                )}
              </div>
              <span className="font-medium">{formatCurrency(line.cents, { showZero: true })}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border mt-4 pt-4 flex items-baseline justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-display text-2xl font-medium">
            {formatCurrency(breakdown.totalCents, { showZero: true })}
          </span>
        </div>
      </div>

      {/* Mock Stripe-style card form */}
      <div className="rounded-lg border border-border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payment details
          </h3>
          <span className="inline-flex items-center gap-1 text-xs text-ink-subtle">
            <Lock className="h-3 w-3" /> Secured by Stripe (mock)
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="card">Card number</Label>
          <Input
            id="card"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="4242 4242 4242 4242"
            inputMode="numeric"
            className="h-12 font-mono"
          />
          <p className="text-xs text-ink-subtle">
            Test cards: <code className="font-mono">4242 4242 4242 4242</code> succeeds ·{' '}
            <code className="font-mono">4000 0000 0000 0002</code> declines
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>MM</Label>
            <Input value={expMonth} onChange={(e) => setExpMonth(e.target.value)} maxLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label>YY</Label>
            <Input value={expYear} onChange={(e) => setExpYear(e.target.value)} maxLength={2} />
          </div>
          <div className="space-y-1.5">
            <Label>CVC</Label>
            <Input value={cvc} onChange={(e) => setCvc(e.target.value)} maxLength={4} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Cardholder name</Label>
            <Input
              value={cardholderName}
              onChange={(e) => setCardholderName(e.target.value)}
              placeholder="Daniela Demo"
              autoComplete="cc-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Billing ZIP</Label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} />
          </div>
        </div>
      </div>

      {/* Trust footer */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          PCI-DSS compliant
        </span>
        <span>·</span>
        <span>SSL encrypted</span>
        <span>·</span>
        <span>14-day refund policy</span>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/11`}
        onNext={onPay}
        pending={pending}
        nextLabel={`Pay ${formatCurrency(breakdown.totalCents, { showZero: true })}`}
      />
    </div>
  );
}
