import type { Metadata } from 'next';

/**
 * English buyer guides whose Spanish articles use a different slug.
 * PR #89 owns the Spanish pages and the locale-path twin map. This file only
 * publishes the English side of the pair so the two PRs can merge separately.
 *
 * After #89 is on main, wire the return links:
 * - pass twinEnglishPath '/guides/florida-llc-without-ssn' on
 *   /es/guides/llc-florida-sin-seguro-social
 * - pass twinEnglishPath '/guides/florida-llc-non-resident' on
 *   /es/guides/llc-florida-para-extranjeros
 * - add both pairs to GUIDE_TWIN_SLUGS in lib/locale-paths.ts
 */
export const WITHOUT_SSN_EN = '/guides/florida-llc-without-ssn';
export const WITHOUT_SSN_ES = '/es/guides/llc-florida-sin-seguro-social';
export const NONRESIDENT_EN = '/guides/florida-llc-non-resident';
export const NONRESIDENT_ES = '/es/guides/llc-florida-para-extranjeros';

export function buyerTwinAlternates(
  englishPath: string,
  esPath: string,
): NonNullable<Metadata['alternates']> {
  return {
    canonical: englishPath,
    languages: {
      en: englishPath,
      es: esPath,
      'x-default': englishPath,
    },
  };
}
