import 'server-only';

import { redirect as nextRedirect } from 'next/navigation';
import { hrefForLocale, localizedRedirectHref } from '@/lib/app-href';
import { type SiteLocale } from '@/lib/pick-locale';
import { localeFromPathOrFiling } from '@/lib/request-locale';
import { storedLocale } from '@/lib/stored-locale';
import { safeRedirectPath } from '@/lib/utils';

export { localizedRedirectHref } from '@/lib/app-href';

export async function localeForRedirect(filingLocale?: string | null): Promise<SiteLocale> {
  // The URL path wins over the filing, the NEXT_LOCALE cookie, and
  // Accept-Language. getLocale() is not used here: with no path it defaults
  // to English and would drop a Spanish filing. storedLocale() returns null
  // when the path is unknown.
  let pathLocale: string | null = null;
  try {
    pathLocale = await storedLocale();
  } catch {
    pathLocale = null;
  }
  return localeFromPathOrFiling(pathLocale, filingLocale);
}

/**
 * Redirect without an /en prefix. Spanish paths stay under /es.
 * Next's redirect is used directly. next-intl's redirect adds /en
 * when locale "en" is passed explicitly.
 */
export async function redirectLocalized(
  href: string,
  filingLocale?: string | null,
): Promise<never> {
  const locale = await localeForRedirect(filingLocale);
  nextRedirect(localizedRedirectHref(href, locale));
  throw new Error('Redirect did not stop execution.');
}

/** Build a same-origin next= target, prefixed when the locale is Spanish. */
export async function localizedNextParam(
  raw: string | null | undefined,
  filingLocale?: string | null,
): Promise<string | null> {
  const safe = safeRedirectPath(raw);
  if (!safe) return null;
  const locale = await localeForRedirect(filingLocale);
  return hrefForLocale(safe, locale);
}
