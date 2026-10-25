export type SiteLocale = 'en' | 'es';

export function asSiteLocale(value: string | null | undefined): SiteLocale | null {
  return value === 'en' || value === 'es' ? value : null;
}

/**
 * A filing's saved locale wins. The request locale is only the fallback,
 * for screens that do not have a filing yet.
 */
export function pickLocale(
  requestLocale: string | null | undefined,
  filingLocale?: string | null,
): SiteLocale {
  return asSiteLocale(filingLocale) ?? (requestLocale === 'es' ? 'es' : 'en');
}
