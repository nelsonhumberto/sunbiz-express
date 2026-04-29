import { loadStripe } from '@stripe/stripe-js';

// loadStripe is safe to call with an empty string during SSR —
// it returns null and Stripe Elements handles the missing key gracefully.
export const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
);
