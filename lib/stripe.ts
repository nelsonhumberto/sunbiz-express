import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Returns the Stripe client singleton.
 * Call this inside request handlers — never at module top level —
 * so the missing-key error only surfaces at runtime, not at build time.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
    _stripe = new Stripe(key, {
      apiVersion: '2026-04-22.dahlia',
      typescript: true,
    });
  }
  return _stripe;
}
