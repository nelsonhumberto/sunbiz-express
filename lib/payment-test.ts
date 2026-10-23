import type { Prisma } from '@prisma/client';
import { formatCurrency } from '@/lib/utils';

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

export type FilingPaidPayment = {
  status: string;
  isTest: boolean;
  amountCents: number;
};

/**
 * Filing-detail paid totals sum every SUCCEEDED payment, including isTest.
 * Real-revenue dashboards still use countsTowardAdminRevenue.
 * A test-only total is labeled, e.g. "$279 (test)".
 */
export function formatAdminFilingPaidTotal(payments: FilingPaidPayment[]): {
  label: string;
  cents: number;
  count: number;
  testCents: number;
} {
  const succeeded = payments.filter((p) => p.status === 'SUCCEEDED');
  const cents = succeeded.reduce((sum, p) => sum + p.amountCents, 0);
  const testCents = succeeded
    .filter((p) => p.isTest)
    .reduce((sum, p) => sum + p.amountCents, 0);
  const realCents = cents - testCents;

  let label: string;
  if (cents === 0) {
    label = formatCurrency(0, { showZero: true });
  } else if (realCents === 0) {
    label = `${formatCurrency(testCents)} (test)`;
  } else if (testCents > 0) {
    label = `${formatCurrency(cents)} (${formatCurrency(testCents)} test)`;
  } else {
    label = formatCurrency(cents);
  }

  return { label, cents, count: succeeded.length, testCents };
}

/** Single payment amount. Test charges keep the dollar amount and a test label. */
export function formatPaymentAmountLabel(
  payment: { amountCents: number; isTest: boolean },
  opts?: { showZero?: boolean },
): string {
  const amount = formatCurrency(payment.amountCents, opts);
  if (!payment.isTest) return amount;
  return `${amount} (test)`;
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
