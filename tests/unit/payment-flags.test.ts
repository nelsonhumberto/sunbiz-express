import { describe, expect, it } from 'vitest';
import { checkoutBelowStateFee } from '@/lib/checkout-guard';
import {
  countsTowardAdminRevenue,
  formatAdminFilingPaidTotal,
  formatPaymentAmountLabel,
  isTestPayment,
} from '@/lib/payment-test';

describe('isTestPayment', () => {
  it('flags mock and tester payment ids', () => {
    expect(isTestPayment({ stripePaymentIntentId: 'pi_mock_demo_filing_paid' })).toBe(true);
    expect(isTestPayment({ stripePaymentIntentId: 'pi_mock_auditor_paid' })).toBe(true);
    expect(isTestPayment({ stripePaymentIntentId: 'TESTER_1710000000000' })).toBe(true);
  });

  it('flags Stripe test-mode charges and leaves livemode charges alone', () => {
    expect(
      isTestPayment({ stripePaymentIntentId: 'pi_3Qabc', livemode: false }),
    ).toBe(true);
    expect(
      isTestPayment({ stripePaymentIntentId: 'pi_3Qabc', livemode: true }),
    ).toBe(false);
    expect(isTestPayment({ stripePaymentIntentId: 'pi_3Qabc' })).toBe(false);
    expect(isTestPayment({ stripePaymentIntentId: 'pi_3Qabc', livemode: true, metadata: { isTest: 'true' } })).toBe(
      true,
    );
  });
});

describe('countsTowardAdminRevenue', () => {
  it('counts only succeeded non-test payments with a charge or a real pi_', () => {
    expect(
      countsTowardAdminRevenue({
        status: 'SUCCEEDED',
        isTest: false,
        stripeChargeId: 'ch_123',
        stripePaymentIntentId: 'pi_3Qabc',
      }),
    ).toBe(true);
    expect(
      countsTowardAdminRevenue({
        status: 'SUCCEEDED',
        isTest: false,
        stripeChargeId: null,
        stripePaymentIntentId: 'pi_3Qabc',
      }),
    ).toBe(true);
    expect(
      countsTowardAdminRevenue({
        status: 'SUCCEEDED',
        isTest: false,
        stripeChargeId: null,
        stripePaymentIntentId: 'pi_mock_auditor_paid',
      }),
    ).toBe(false);
    expect(
      countsTowardAdminRevenue({
        status: 'SUCCEEDED',
        isTest: true,
        stripeChargeId: 'ch_123',
        stripePaymentIntentId: 'pi_3TmJceF5Zi2kVU7i0gsXfXQl',
      }),
    ).toBe(false);
    expect(
      countsTowardAdminRevenue({
        status: 'PENDING',
        isTest: false,
        stripeChargeId: 'ch_123',
        stripePaymentIntentId: 'pi_3Qabc',
      }),
    ).toBe(false);
    expect(
      countsTowardAdminRevenue({
        status: 'SUCCEEDED',
        isTest: false,
        stripeChargeId: '',
        stripePaymentIntentId: null,
      }),
    ).toBe(false);
  });
});

describe('formatAdminFilingPaidTotal', () => {
  it('sums succeeded test payments and labels them instead of $0', () => {
    expect(
      formatAdminFilingPaidTotal([
        { status: 'SUCCEEDED', isTest: true, amountCents: 27900 },
        { status: 'PENDING', isTest: false, amountCents: 5000 },
      ]),
    ).toEqual({
      label: '$279 (test)',
      cents: 27900,
      count: 1,
      testCents: 27900,
    });
  });

  it('sums succeeded live payments without a test label', () => {
    expect(
      formatAdminFilingPaidTotal([
        { status: 'SUCCEEDED', isTest: false, amountCents: 27900 },
        { status: 'FAILED', isTest: false, amountCents: 27900 },
      ]),
    ).toMatchObject({ label: '$279', cents: 27900, count: 1, testCents: 0 });
  });

  it('labels the test portion when live and test payments both succeeded', () => {
    expect(
      formatAdminFilingPaidTotal([
        { status: 'SUCCEEDED', isTest: false, amountCents: 10000 },
        { status: 'SUCCEEDED', isTest: true, amountCents: 27900 },
      ]).label,
    ).toBe('$379 ($279 test)');
  });

  it('shows $0 when nothing succeeded', () => {
    expect(formatAdminFilingPaidTotal([]).label).toBe('$0');
  });
});

describe('formatPaymentAmountLabel', () => {
  it('labels a test charge and leaves a live charge unlabeled', () => {
    expect(formatPaymentAmountLabel({ amountCents: 27900, isTest: true })).toBe('$279 (test)');
    expect(formatPaymentAmountLabel({ amountCents: 27900, isTest: false })).toBe('$279');
  });
});

describe('checkoutBelowStateFee', () => {
  it('rejects totals under the bundled state fee and accepts the fee itself', () => {
    expect(checkoutBelowStateFee({ totalCents: 148, stateFeeCents: 12_500 })).toBe(true);
    expect(checkoutBelowStateFee({ totalCents: 12_500, stateFeeCents: 12_500 })).toBe(false);
    expect(checkoutBelowStateFee({ totalCents: 14_900, stateFeeCents: 12_500 })).toBe(false);
  });
});
