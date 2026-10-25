import { getPathname } from '@/i18n/navigation';
import { type SiteLocale } from '@/lib/pick-locale';

/** True when the path is already on the Spanish site. */
export function isSpanishHref(href: string): boolean {
  const path = (href.split(/[?#]/)[0] || '/').trim();
  return path === '/es' || path.startsWith('/es/');
}

/**
 * Prefix an in-app path for Spanish. Paths that already start with /es
 * are left alone so a second pass does not produce /es/es.
 */
export function hrefForLocale(href: string, locale: SiteLocale): string {
  if (isSpanishHref(href)) return href;
  return getPathname({ href, locale });
}
