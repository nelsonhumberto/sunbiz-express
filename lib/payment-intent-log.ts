/** One safe line for a failed PaymentIntent create. Filing id only. No email, card, or key. */
export function paymentCreateFailureLog(input: {
  filingId?: string | null;
  reason: string;
}): { area: 'stripe'; tag: 'create_failed'; entityId?: string; reason: string } {
  const filingId = (input.filingId ?? '').trim();
  const reason = input.reason
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return {
    area: 'stripe',
    tag: 'create_failed',
    ...(filingId ? { entityId: filingId } : {}),
    reason: reason || 'unknown',
  };
}

export function safePaymentErrorReason(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return 'unknown';
}
