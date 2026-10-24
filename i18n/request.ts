import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { isSpanishPublicPath, LOCALE_HEADER, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { defaultLocale, type Locale } from './config';

export default getRequestConfig(async () => {
  const headerStore = headers();
  const publicPath = headerStore.get(PUBLIC_PATH_HEADER) ?? '';
  const hinted = headerStore.get(LOCALE_HEADER);
  // Path wins. NEXT_LOCALE is ignored so a prefetched /es link cannot make
  // a later English URL render in Spanish. See i18n/routing.ts (localeDetection: false).
  const locale: Locale = publicPath
    ? isSpanishPublicPath(publicPath)
      ? 'es'
      : 'en'
    : hinted === 'es' || hinted === 'en'
      ? hinted
      : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'America/New_York',
  };
});
