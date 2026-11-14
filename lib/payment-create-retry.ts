/**
 * One automatic retry for a lost or 5xx PaymentIntent create.
 * A known 4xx is not retried. The second call keeps the same filing id
 * and, when the first response named an intent, that same intent id.
 */

export type PaymentCreateAttempt = {
  status: number;
  json: Record<string, unknown> | null;
  networkError?: boolean;
};

export function paymentCreateShouldRetry(input: {
  attempt: number;
  networkError?: boolean;
  status: number;
  code?: string | null;
  hasClientSecret?: boolean;
}): boolean {
  if (input.attempt > 0 || input.hasClientSecret) return false;
  if (input.networkError) return true;
  if (input.code === 'create_failed') return true;
  if (input.status === 0 || input.status >= 500) return true;
  return false;
}

export async function postPaymentIntent(
  post: (body: Record<string, unknown>) => Promise<PaymentCreateAttempt>,
  body: Record<string, unknown>,
): Promise<PaymentCreateAttempt> {
  const first = await post(body);
  const code = typeof first.json?.code === 'string' ? first.json.code : null;
  const paymentIntentId =
    typeof first.json?.paymentIntentId === 'string' ? first.json.paymentIntentId : undefined;
  const hasClientSecret = typeof first.json?.clientSecret === 'string' && first.json.clientSecret.length > 0;
  if (
    !paymentCreateShouldRetry({
      attempt: 0,
      networkError: first.networkError,
      status: first.status,
      code,
      hasClientSecret,
    })
  ) {
    return first;
  }
  return post({
    ...body,
    ...(paymentIntentId ? { paymentIntentId } : {}),
  });
}
