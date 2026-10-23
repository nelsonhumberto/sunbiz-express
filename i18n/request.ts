import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_HEADER } from '@/lib/locale-paths';
import { defaultLocale, locales, LOCALE_COOKIE, type Locale } from './config';

export default getRequestConfig(async () => {
  const hinted = headers().get(LOCALE_HEADER);
  const headerLocale: Locale | undefined =
    hinted === 'en' || hinted === 'es' ? hinted : undefined;
  const store = cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value as Locale | undefined;
  const locale: Locale =
    headerLocale ??
    (cookieLocale && locales.includes(cookieLocale) ? cookieLocale : defaultLocale);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'America/New_York',
  };
});
