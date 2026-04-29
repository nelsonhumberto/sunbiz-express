import Stripe from 'stripe';

// Lazily initialised so the module can be imported during the Next.js build
// phase when STRIPE_SECRET_KEY is not yet in the environment.
let _stripe: Stripe | null = null;

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

/**
 * Convenience re-export for call-sites that import `stripe` directly.
 * Accessing any property triggers the lazy init and will throw at runtime
 * (not build time) if the key is missing.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
