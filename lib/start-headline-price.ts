import { tierPackagePriceCents, type TierSlug } from '@/lib/pricing';

const START_PRICE_TIERS = new Set<TierSlug>(['BASIC', 'STANDARD', 'PREMIUM']);

function startEntityType(
  entity: string | null | undefined,
  preselectFloridaLlc: boolean | undefined,
): 'LLC' | 'CORP' {
  if (preselectFloridaLlc) return 'LLC';
  const upper = (entity ?? '').trim().toUpperCase();
  if (
    upper === 'CORP' ||
    upper === 'CORPORATION' ||
    upper === 'SCORP' ||
    upper === 'S-CORP' ||
    upper === 'S_CORP'
  ) {
    return 'CORP';
  }
  return 'LLC';
}

/**
 * Headline all-in price on /start, from lib/pricing.ts.
 * A missing or unknown tier is Essential. S-Corp uses the corporation package.
 */
export function startHeadlinePriceCents(input: {
  tier?: string | null;
  state?: string | null;
  entity?: string | null;
  preselectFloridaLlc?: boolean;
}): number {
  const upper = (input.tier ?? '').trim().toUpperCase();
  const tier = START_PRICE_TIERS.has(upper as TierSlug) ? (upper as TierSlug) : null;
  const entityType = startEntityType(input.entity, input.preselectFloridaLlc);
  if (!tier) return tierPackagePriceCents('BASIC', entityType, 'FL');
  const state = input.preselectFloridaLlc ? 'FL' : input.state;
  const code = state === 'WY' || state === 'DE' ? state : 'FL';
  return tierPackagePriceCents(tier, entityType, code);
}
