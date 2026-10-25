import { stripDefaultLocalePrefix } from '@/i18n/config';
import { localizedHref } from '@/lib/locale-paths';
import { type SiteLocale } from '@/lib/pick-locale';
import { safeRedirectPath } from '@/lib/utils';

/** True when the path is already on the Spanish site. */
export function isSpanishHref(href: string): boolean {
  const path = (href.split(/[?#]/)[0] || '/').trim();
  return path === '/es' || path.startsWith('/es/');
}

/**
 * Drop a forced `/en` prefix, keeping the query string and hash.
 * Paths that are not prefixed are returned unchanged.
 */
export function hrefWithoutDefaultLocale(href: string): string {
  const hashAt = href.indexOf('#');
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const withoutHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  const query = queryAt === -1 ? '' : withoutHash.slice(queryAt);
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const bare = stripDefaultLocalePrefix(path || '/');
  if (!bare) return href;
  return `${bare}${query}${hash}`;
}

/**
 * Prefix an in-app path for Spanish. English stays unprefixed.
 * Paths that already start with /es are left alone so a second pass
 * does not produce /es/es. Passing locale "en" to next-intl forces an
 * /en prefix this app does not serve, so the prefix is applied here.
 */
export function hrefForLocale(href: string, locale: SiteLocale): string {
  if (isSpanishHref(href)) return href;
  const bare = hrefWithoutDefaultLocale(href);
  if (locale === 'es') return localizedHref(bare, 'es');
  return bare;
}

/** Path the client router should push. Same rule as hrefForLocale. */
export function localizedRouterHref(href: string, locale: SiteLocale): string {
  return hrefForLocale(href, locale);
}

/** Path a server redirect should send. English stays unprefixed. */
export function localizedRedirectHref(href: string, locale: SiteLocale): string {
  const safe = safeRedirectPath(href);
  return hrefForLocale(safe ?? '/dashboard', locale);
}
