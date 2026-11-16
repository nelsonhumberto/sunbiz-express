import { localeFromPublicPath } from '@/lib/locale-paths';
import type { Locale } from '@/i18n/config';

export type CookieNoticeCopy = {
  label: string;
  body: string;
  privacy: string;
  accept: string;
  essential: string;
};

/**
 * The banner is a client component that appears after idle, so a provider
 * that hydrated in English would paint English copy on /es. The public
 * path is the language. A missing path stays on the request locale.
 */
export function cookieNoticeLocale(publicPath: string, requestLocale: string): Locale {
  if (publicPath) return localeFromPublicPath(publicPath);
  return requestLocale === 'es' ? 'es' : 'en';
}
