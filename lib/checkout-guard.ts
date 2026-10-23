/**
 * Checkout must not accept a total below the government fees bundled into
 * the selected tier. Coupons can reduce LaunchForma's service margin, but
 * they cannot discount past the state fee we have to remit.
 */
export function checkoutBelowStateFee(input: {
  totalCents: number;
  stateFeeCents: number;
}): boolean {
  return input.totalCents < input.stateFeeCents;
}

export const CHECKOUT_BELOW_STATE_FEE_ERROR =
  'This total is below the state fee for the selected package.';
