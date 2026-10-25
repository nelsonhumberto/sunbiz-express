'use server';

import { checkActionRateLimit } from '@/lib/rate-limit';
import { fulfillReinstatementOrder } from '@/lib/reinstatement-fulfill';
import { serviceOrderError } from '@/lib/service-order';

export async function completeReinstatementOrder(input: unknown) {
  const limited = checkActionRateLimit('reinstatement-complete', 8, 10 * 60 * 1000);
  if (limited) {
    const locale = input && typeof input === 'object' && (input as { locale?: string }).locale === 'es' ? 'es' : 'en';
    return { ok: false as const, error: serviceOrderError(locale, 'rate') };
  }
  return fulfillReinstatementOrder(input);
}
