import type { TierSlug } from '@/lib/pricing';

const VALID_TIERS = new Set<TierSlug>(['BASIC', 'STANDARD', 'PREMIUM']);

/**
 * The landing headline is the Basic package. A valid ?tier= still wins.
 * Empty or unknown values must not fall through to Standard.
 */
export function asTier(value: string | null | undefined): TierSlug {
  const upper = (value ?? '').toUpperCase();
  return VALID_TIERS.has(upper as TierSlug) ? (upper as TierSlug) : 'BASIC';
}

/** `tier` from a landing URL, including one that also has utm params. */
export function tierFromLandingSearch(search: string | null | undefined): string | undefined {
  if (!search) return undefined;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const tier = new URLSearchParams(raw).get('tier')?.trim();
  return tier || undefined;
}

/**
 * Tier sent to openGuestDraft.
 * A card the visitor pressed wins. Otherwise `?tier=` on this search wins
 * when it is Basic, Standard, or Premium. Anything else is Basic.
 * The hidden field and a missing page prop are not consulted: a Basic
 * value rendered before the address bar was read must not replace the URL.
 */
export function landingStartTier(picked: TierSlug | null, search: string | null | undefined): TierSlug {
  if (picked) return picked;
  if (search == null) return 'BASIC';
  const raw = new URLSearchParams(search).get('tier');
  const upper = (raw ?? '').trim().toUpperCase();
  if (upper === 'BASIC' || upper === 'STANDARD' || upper === 'PREMIUM') return upper;
  return 'BASIC';
}
