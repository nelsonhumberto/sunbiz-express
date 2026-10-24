/**
 * Visible "test mode" on checkout. True when this deploy is not production
 * or the Stripe publishable key is a test key. Does not read or change
 * Stripe charge behavior.
 */
export function isCheckoutTestMode(input: {
  vercelEnv?: string | null;
  publishableKey?: string | null;
}): boolean {
  if ((input.vercelEnv ?? '') !== 'production') return true;
  return (input.publishableKey ?? '').startsWith('pk_test_');
}
