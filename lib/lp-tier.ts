import type { TierSlug } from '@/lib/pricing';

const VALID_TIERS = new Set<TierSlug>(['BASIC', 'STANDARD', 'PREMIUM']);

/**
 * The landing headline is the Basic package. A valid ?tier= still wins.
 * Empty or unknown values must not fall through to Standard.
 */
export function asTier(value: string | undefined): TierSlug {
  const upper = (value ?? '').toUpperCase();
  return VALID_TIERS.has(upper as TierSlug) ? (upper as TierSlug) : 'BASIC';
}
