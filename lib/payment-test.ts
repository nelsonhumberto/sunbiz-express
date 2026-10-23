import type { Prisma } from '@prisma/client';

/**
 * A payment is a test when its Stripe PaymentIntent id is one of our
 * synthetic prefixes, or Stripe reports the charge was not in livemode.
 * Real livemode charges stay isTest=false even if the id is unusual.
 */
export function isTestPayment(input: {
  stripePaymentIntentId?: string | null;
  livemode?: boolean | null;
}): boolean {
  const id = input.stripePaymentIntentId ?? '';
  if (id.startsWith('pi_mock_') || id.startsWith('TESTER_')) return true;
  return input.livemode === false;
}

/** A recorded Stripe charge id, or a real PaymentIntent id (never pi_mock_). */
export function hasRecordedStripePayment(input: {
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
}): boolean {
  const chargeId = input.stripeChargeId ?? '';
  if (chargeId.length > 0) return true;
  const intentId = input.stripePaymentIntentId ?? '';
  return intentId.startsWith('pi_') && !intentId.startsWith('pi_mock_');
}

/**
 * Admin revenue totals include a payment only when it succeeded, is not a
 * test, and Stripe recorded a charge id or a real PaymentIntent id.
 */
export function countsTowardAdminRevenue(payment: {
  status: string;
  isTest: boolean;
  stripeChargeId?: string | null;
  stripePaymentIntentId?: string | null;
}): boolean {
  return (
    payment.status === 'SUCCEEDED' &&
    payment.isTest === false &&
    hasRecordedStripePayment(payment)
  );
}

export const adminRevenuePaymentWhere = {
  status: 'SUCCEEDED',
  isTest: false,
  OR: [
    { stripeChargeId: { not: '' } },
    {
      AND: [
        { stripePaymentIntentId: { startsWith: 'pi_' } },
        { NOT: { stripePaymentIntentId: { startsWith: 'pi_mock_' } } },
      ],
    },
  ],
} satisfies Prisma.PaymentWhereInput;
