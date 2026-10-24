/**
 * Checkout PaymentIntent reuse. A Pay click or a reload must not mint a new
 * Stripe intent while the filing still has one Stripe can confirm.
 */

/** Statuses Stripe still lets us confirm or reprice. */
export const REUSABLE_PAYMENT_INTENT_STATUSES = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
] as const;

export function isReusablePaymentIntentStatus(status: string | null | undefined): boolean {
  return REUSABLE_PAYMENT_INTENT_STATUSES.includes(
    status as (typeof REUSABLE_PAYMENT_INTENT_STATUSES)[number],
  );
}

/**
 * Idempotency key for a new intent. Derived from the filing id and amount.
 * When a previous intent for that pair is no longer reusable, the old id is
 * appended so Stripe does not replay the dead intent for 24 hours.
 */
export function checkoutPaymentIntentIdempotencyKey(
  filingId: string,
  amountCents: number,
  supersededPaymentIntentId?: string | null,
): string {
  const base = `filing_${filingId}_amt_${amountCents}`;
  const key = supersededPaymentIntentId
    ? `${base}_after_${supersededPaymentIntentId}`
    : base;
  return key.slice(0, 255);
}

export type CheckoutPaymentIntentPlan =
  | { action: 'reuse'; paymentIntentId: string; updateAmount: boolean }
  | { action: 'create'; idempotencyKey: string };

export function planCheckoutPaymentIntent(input: {
  filingId: string;
  amountCents: number;
  storedPaymentIntentId?: string | null;
  storedStatus?: string | null;
  storedAmount?: number | null;
}): CheckoutPaymentIntentPlan {
  const storedId = input.storedPaymentIntentId?.trim() || null;
  if (storedId && isReusablePaymentIntentStatus(input.storedStatus)) {
    return {
      action: 'reuse',
      paymentIntentId: storedId,
      updateAmount: input.storedAmount !== input.amountCents,
    };
  }
  return {
    action: 'create',
    idempotencyKey: checkoutPaymentIntentIdempotencyKey(
      input.filingId,
      input.amountCents,
      storedId,
    ),
  };
}
