'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readCheckoutPaymentStatus } from '@/actions/checkout-payment-status';
import { onCheckoutPaymentPaid, watchCheckoutPayment } from '@/lib/checkout-payment-watch';

/**
 * PaymentIntent receipts can render before the webhook marks SUCCEEDED.
 * Poll that row, then count the purchase and refresh so the tracker mounts.
 */
export function CheckoutPaymentWatch({
  filingId,
  isTester,
  email,
}: {
  filingId: string;
  isTester?: boolean;
  email?: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    const signal = { aborted: false };
    void watchCheckoutPayment({
      signal,
      check: () => readCheckoutPaymentStatus(filingId),
      onPaid: (paid) => {
        onCheckoutPaymentPaid(paid, { isTester, email }, () => router.refresh());
      },
    });
    return () => {
      signal.aborted = true;
    };
  }, [filingId, isTester, email, router]);

  return null;
}
