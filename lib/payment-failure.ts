/**
 * payment_intent.payment_failed on the existing Payment row.
 * Status values already on the model: PENDING, SUCCEEDED, FAILED, REFUNDED.
 * A succeeded or refunded row is left alone. A second failure is a replay.
 */

export type PaymentFailurePlan = 'create' | 'mark_failed' | 'replay' | 'leave_paid';

export function planPaymentFailure(status: string | null | undefined): PaymentFailurePlan {
  if (status == null) return 'create';
  if (status === 'FAILED') return 'replay';
  if (status === 'PENDING') return 'mark_failed';
  return 'leave_paid';
}

/** A later success may promote a failed or pending row. Paid rows stay paid. */
export type SucceededPaymentPlan = 'create' | 'upgrade' | 'noop';

export function planSucceededPayment(status: string | null | undefined): SucceededPaymentPlan {
  if (status == null) return 'create';
  if (status === 'FAILED' || status === 'PENDING') return 'upgrade';
  return 'noop';
}

/** Stripe's decline text, trimmed. Empty when the event has no message. */
export function paymentFailureNote(message: string | null | undefined): string | null {
  const trimmed = (message ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 240);
}
