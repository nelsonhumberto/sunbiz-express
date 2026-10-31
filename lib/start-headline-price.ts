import { tierPackagePriceCents, type TierSlug } from '@/lib/pricing';

const START_PRICE_TIERS = new Set<TierSlug>(['BASIC', 'STANDARD', 'PREMIUM']);

/**
 * Headline all-in price on /start.
 * A missing or unknown tier keeps the Essential Florida LLC amount.
 */
export function startHeadlinePriceCents(input: {
  tier?: string | null;
  state?: string | null;
  preselectFloridaLlc?: boolean;
}): number {
  const upper = (input.tier ?? '').trim().toUpperCase();
  const tier = START_PRICE_TIERS.has(upper as TierSlug) ? (upper as TierSlug) : null;
  if (!tier) return tierPackagePriceCents('BASIC', 'LLC', 'FL');
  const state = input.preselectFloridaLlc ? 'FL' : input.state;
  const code = state === 'WY' || state === 'DE' ? state : 'FL';
  return tierPackagePriceCents(tier, 'LLC', code);
}
