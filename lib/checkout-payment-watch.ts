import { trackGooglePurchase } from '@/lib/analytics';

/** Between 2 and 3 seconds. A late Stripe webhook still lands inside the window. */
export const CHECKOUT_PAYMENT_POLL_INTERVAL_MS = 2_500;
/** About a minute of checks, then the confirming notice stays as it is. */
export const CHECKOUT_PAYMENT_POLL_TIMEOUT_MS = 60_000;

export type CheckoutPaymentPollResult =
  | { status: 'pending' }
  | {
      status: 'paid';
      transactionId: string;
      amountCents: number;
      currency: string;
      isTest: boolean;
    };

/**
 * Ask until the filing's payment is SUCCEEDED, or the minute is up.
 * `onPaid` runs once. The caller renders CheckoutConversionTracker from that.
 */
export async function watchCheckoutPayment(input: {
  check: () => Promise<CheckoutPaymentPollResult>;
  onPaid: (paid: Extract<CheckoutPaymentPollResult, { status: 'paid' }>) => void;
  intervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  signal?: { aborted: boolean };
}): Promise<'paid' | 'timeout'> {
  const intervalMs = input.intervalMs ?? CHECKOUT_PAYMENT_POLL_INTERVAL_MS;
  const timeoutMs = input.timeoutMs ?? CHECKOUT_PAYMENT_POLL_TIMEOUT_MS;
  const now = input.now ?? (() => Date.now());
  const wait =
    input.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const started = now();

  while (!input.signal?.aborted) {
    if (now() - started >= timeoutMs) return 'timeout';
    const result = await input.check();
    if (result.status === 'paid') {
      input.onPaid(result);
      return 'paid';
    }
    if (input.signal?.aborted) return 'timeout';
    if (now() - started + intervalMs >= timeoutMs) return 'timeout';
    await wait(intervalMs);
  }
  return 'timeout';
}

/**
 * Count the sale once, then refresh so the receipt can mount the tracker.
 * trackGooglePurchase keeps tester, isTest, qa+ email, opt-out, and GPC gates,
 * and dedupes on transaction_id. A second call from the tracker does not send again.
 */
export function onCheckoutPaymentPaid(
  paid: Extract<CheckoutPaymentPollResult, { status: 'paid' }>,
  actor: { isTester?: boolean | null; email?: string | null },
  refresh: () => void,
): void {
  trackGooglePurchase({
    transactionId: paid.transactionId,
    valueCents: paid.amountCents,
    currency: paid.currency,
    isTest: paid.isTest,
    isTester: actor.isTester,
    email: actor.email,
  });
  refresh();
}
