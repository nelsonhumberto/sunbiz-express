import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_HEADER, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { resolveRequestLocale } from '@/lib/request-locale';
import { defaultLocale, type Locale } from './config';

export default getRequestConfig(async () => {
  const headerStore = headers();
  const publicPath = headerStore.get(PUBLIC_PATH_HEADER) ?? '';
  const hinted = headerStore.get(LOCALE_HEADER);
  // Path wins. NEXT_LOCALE and Accept-Language are ignored so a prefetched
  // /es link, a leftover cookie, or the browser language cannot make a later
  // English URL render in Spanish. Server actions often miss the rewrite
  // header, so Referer and next-url are the address bar. See i18n/routing.ts.
  const locale: Locale =
    resolveRequestLocale({
      publicPath,
      nextUrl: headerStore.get('next-url'),
      referer: headerStore.get('referer'),
      localeHeader: hinted,
      allowedHost: headerStore.get('host'),
      serverAction: Boolean(headerStore.get('next-action')),
    }) ?? defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'America/New_York',
  };
});
