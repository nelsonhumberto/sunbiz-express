import { logger } from '@/lib/logger';
import { getStripe } from '@/lib/stripe';
import {
  toCheckoutSessionSnapshot,
  type CheckoutSessionSnapshot,
} from '@/lib/checkout-session-verification';

/**
 * Load a Checkout Session for the success page. Invalid ids and Stripe
 * errors become a null session so the page can render the confirming state
 * without recording a purchase.
 */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<CheckoutSessionSnapshot | null> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return toCheckoutSessionSnapshot(session);
  } catch (err) {
    logger.warn('checkout session retrieve failed', {
      area: 'checkout',
      tag: 'checkout-session',
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
