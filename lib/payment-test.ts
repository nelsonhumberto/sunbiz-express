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
