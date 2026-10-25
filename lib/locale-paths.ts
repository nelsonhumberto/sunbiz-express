import { stripSpanishPrefix, type Locale } from '@/i18n/config';
import { routing } from '@/i18n/routing';

/**
 * English public path -> Spanish slug (no `/es` prefix), taken from
 * next-intl pathnames. `/contact` is `/contacto` in Spanish.
 */
const EN_TO_ES_SLUG: Record<string, string> = {};
const ES_TO_EN_PATH: Record<string, string> = {};
for (const value of Object.values(routing.pathnames ?? {})) {
  if (!value || typeof value === 'string') continue;
  const en = value.en;
  const es = value.es;
  if (!en || !es || (en as string) === (es as string)) continue;
  const enPath = en.startsWith('/') ? en : `/${en}`;
  const esPath = es.startsWith('/') ? es : `/${es}`;
  EN_TO_ES_SLUG[enPath] = esPath;
  ES_TO_EN_PATH[esPath] = enPath;
}

function withoutTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || '/';
}

/** `/es` and `/es/*` are Spanish. Every other path is English. */
export function localeFromPublicPath(pathname: string): Locale {
  return isSpanishPublicPath(pathname) ? 'es' : 'en';
}

/**
 * Move an explicit `?lang=` onto the path. The cookie is not involved.
 * Returns null when the path already matches the requested language.
 */
export function localeQueryRedirect(
  pathname: string,
  searchParams: { get(name: string): string | null; toString(): string },
): { pathname: string; search: string } | null {
  const lang = (searchParams.get('lang') ?? '').toLowerCase();
  if (lang !== 'en' && lang !== 'es') return null;
  const spanish = isSpanishPublicPath(pathname);
  if ((lang === 'es' && spanish) || (lang === 'en' && !spanish)) return null;

  const next = new URLSearchParams(searchParams.toString());
  next.delete('lang');
  const search = next.toString();
  const path = lang === 'es' ? toSpanishUrl(pathname) : englishPathname(pathname);
  return { pathname: path, search };
}

/** Original browser pathname, including a leading /es when present. */
export const PUBLIC_PATH_HEADER = 'x-lf-public-path';
/** Locale chosen for this request (en or es), set by middleware. */
export const LOCALE_HEADER = 'x-lf-locale';

/** Browser pathname with the /es prefix removed. Ignores query and hash. */
export function englishPathname(pathname: string): string {
  const path = (pathname.split('?')[0] ?? pathname).split('#')[0] || '/';
  const stripped = stripSpanishPrefix(path);
  if (stripped == null) return path.startsWith('/') ? path : `/${path}`;
  return ES_TO_EN_PATH[stripped] ?? stripped;
}

/**
 * 308 when a URL uses the other language's slug.
 * `/contacto` goes to `/es/contacto`. `/es/contact` goes to `/es/contacto`.
 * Returns null for the canonical English and Spanish URLs.
 */
export function localizedPublicRedirect(pathname: string): string | null {
  const path = withoutTrailingSlash((pathname.split('?')[0] ?? pathname).split('#')[0] || '/');
  const fromBareSpanishSlug = ES_TO_EN_PATH[path];
  if (fromBareSpanishSlug) return toSpanishUrl(fromBareSpanishSlug);
  if (path.startsWith('/es/')) {
    const englishSlug = path.slice(3);
    const spanishSlug = EN_TO_ES_SLUG[englishSlug];
    if (spanishSlug) {
      const canonical = `/es${spanishSlug}`;
      if (canonical !== path) return canonical;
    }
  }
  return null;
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
  const localized = path === '/' ? '/' : (EN_TO_ES_SLUG[path] ?? path);
  const prefixed = localized === '/' ? '/es' : `/es${localized}`;
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
  const next = locale === 'es' ? toSpanishUrl(english) : english;
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
