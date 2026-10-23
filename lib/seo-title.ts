import type { Metadata } from 'next';

export const BRAND_NAME = 'LaunchForma';
export const BRAND_TITLE_SUFFIX = ` · ${BRAND_NAME}`;

/**
 * Root layout template is `%s · LaunchForma`.
 * Phrases that already contain the brand are returned as absolute titles so
 * the template does not append a second "· LaunchForma".
 */
export function pageTitle(phrase: string): Metadata['title'] {
  const trimmed = phrase.trim();
  if (trimmed.toLowerCase().includes(BRAND_NAME.toLowerCase())) {
    return { absolute: trimmed };
  }
  return trimmed;
}

/** Document title after the root template is applied. */
export function withBrand(phrase: string): string {
  const trimmed = phrase.trim();
  if (trimmed.toLowerCase().includes(BRAND_NAME.toLowerCase())) return trimmed;
  return `${trimmed}${BRAND_TITLE_SUFFIX}`;
}

/** Homepage `<title>` phrase. Florida leads with the target query. */
export function homeTitlePhrase(stateName: string, stateCode: string): string {
  if (stateCode === 'FL') return 'Form a Florida LLC Online, State Fee Included';
  return statePageTitlePhrase(stateName);
}

/** Active state landing `<title>` phrase. Search phrase first, no brand. */
export function statePageTitlePhrase(stateName: string): string {
  return `Form a ${stateName} LLC Online`;
}
