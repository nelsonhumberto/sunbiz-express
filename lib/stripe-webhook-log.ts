/**
 * One log line per Stripe webhook delivery. Only the event type, id, and
 * outcome. Never the payload, signature, card, or email.
 */

const SAFE_TOKEN = /^[A-Za-z0-9._:-]{1,120}$/;

function webhookLogToken(value: string): string {
  const trimmed = value.trim();
  if (!SAFE_TOKEN.test(trimmed)) return 'redacted';
  if (/sk_|whsec_|rk_|@/i.test(trimmed)) return 'redacted';
  return trimmed;
}

export function formatStripeWebhookLog(input: {
  type: string;
  id: string;
  outcome: string;
}): string {
  const type = webhookLogToken(input.type);
  const id = webhookLogToken(input.id);
  const outcome = webhookLogToken(input.outcome);
  return `stripe webhook type=${type} id=${id} outcome=${outcome}`;
}
