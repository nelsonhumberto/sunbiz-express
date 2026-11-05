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
 * A card the visitor pressed wins. Otherwise the address-bar ?tier= wins,
 * then the hidden form field, then the prop from the page.
 * An empty value is Basic. It must not replace a tier that was actually passed.
 */
export function landingStartTier(input: {
  picked: TierSlug | null;
  formTier?: string | null;
  search?: string | null;
  initialTier?: string | null;
}): TierSlug {
  if (input.picked) return input.picked;
  const fromUrl = tierFromLandingSearch(input.search);
  if (fromUrl) return asTier(fromUrl);
  const posted = typeof input.formTier === 'string' ? input.formTier.trim() : '';
  if (posted) return asTier(posted);
  return asTier(input.initialTier);
}
