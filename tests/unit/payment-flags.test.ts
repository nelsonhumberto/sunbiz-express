import { describe, expect, it } from 'vitest';
import { checkoutBelowStateFee } from '@/lib/checkout-guard';
import { isTestPayment } from '@/lib/payment-test';

describe('isTestPayment', () => {
  it('flags mock and tester payment ids', () => {
    expect(isTestPayment({ stripePaymentIntentId: 'pi_mock_demo_filing_paid' })).toBe(true);
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
  });
});

describe('checkoutBelowStateFee', () => {
  it('rejects totals under the bundled state fee and accepts the fee itself', () => {
    expect(checkoutBelowStateFee({ totalCents: 148, stateFeeCents: 12_500 })).toBe(true);
    expect(checkoutBelowStateFee({ totalCents: 12_500, stateFeeCents: 12_500 })).toBe(false);
    expect(checkoutBelowStateFee({ totalCents: 14_900, stateFeeCents: 12_500 })).toBe(false);
  });
});
