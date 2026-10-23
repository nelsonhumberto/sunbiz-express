import { stripSpanishPrefix, type Locale } from '@/i18n/config';

/** Original browser pathname, including a leading /es when present. */
export const PUBLIC_PATH_HEADER = 'x-lf-public-path';
/** Locale chosen for this request (en or es), set by middleware. */
export const LOCALE_HEADER = 'x-lf-locale';

/** Browser pathname with the /es prefix removed. Ignores query and hash. */
export function englishPathname(pathname: string): string {
  const path = (pathname.split('?')[0] ?? pathname).split('#')[0] || '/';
  return stripSpanishPrefix(path) ?? (path.startsWith('/') ? path : `/${path}`);
}

export function isSpanishPublicPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] ?? pathname).split('#')[0] || '/';
  return stripSpanishPrefix(path) !== null;
}

/**
 * Spanish counterpart of an English path. The path may include a query
 * string or hash. `/` becomes `/es`, never the unprefixed homepage.
 */
export function toSpanishUrl(englishPath: string): string {
  const hashAt = englishPath.indexOf('#');
  const hash = hashAt === -1 ? '' : englishPath.slice(hashAt);
  const withoutHash = hashAt === -1 ? englishPath : englishPath.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  const query = queryAt === -1 ? '' : withoutHash.slice(queryAt);
  const rawPath = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const prefixed = path === '/' ? '/es' : `/es${path}`;
  return `${prefixed}${query}${hash}`;
}

/** Keep the current page path and only swap the locale prefix. */
export function pathForLocale(pathname: string, locale: Locale): string {
  const hashAt = pathname.indexOf('#');
  const hash = hashAt === -1 ? '' : pathname.slice(hashAt);
  const withoutHash = hashAt === -1 ? pathname : pathname.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  const query = queryAt === -1 ? '' : withoutHash.slice(queryAt);
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const english = englishPathname(path || '/');
  const next = locale === 'es' ? (english === '/' ? '/es' : `/es${english}`) : english;
  return `${next}${query}${hash}`;
}

/** Prefix in-app links while the reader is on the Spanish site. */
export function localizedHref(href: string, locale: string): string {
  if (locale !== 'es') return href;
  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('#')
  ) {
    return href;
  }
  if (href === '/es' || href.startsWith('/es/') || href.startsWith('/es?')) return href;
  return toSpanishUrl(href);
}
