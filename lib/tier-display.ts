import { TIER_BY_SLUG, type TierSlug } from '@/lib/pricing';

const SLUGS = new Set<string>(['BASIC', 'STANDARD', 'PREMIUM']);

export function isTierSlug(value: string): value is TierSlug {
  return SLUGS.has(value);
}

/**
 * Customer-facing package name. Review must not print the stored slug
 * ("BASIC"); it prints Essential / Popular / Premium (or the locale string).
 */
export function serviceTierDisplayName(
  slug: string,
  translate?: (key: string) => string,
): string {
  if (!isTierSlug(slug)) return slug;
  if (translate) {
    const localized = translate(`tier_${slug}`);
    if (localized && localized !== `tier_${slug}`) return localized;
  }
  return TIER_BY_SLUG[slug].name;
}
