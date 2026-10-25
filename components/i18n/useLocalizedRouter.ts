'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { localizedRouterHref } from '@/lib/app-href';
import { localeFromPublicPath } from '@/lib/locale-paths';
import { pickLocale } from '@/lib/pick-locale';

export { localizedRouterHref } from '@/lib/app-href';

/**
 * Wizard and auth navigation.
 * The address bar wins over the filing locale, the next-intl context,
 * NEXT_LOCALE, and Accept-Language. English hrefs stay unprefixed.
 * The next-intl router is not used: passing locale "en" adds /en.
 */
export function useLocalizedRouter(filingLocale?: string | null) {
  const router = useRouter();
  const requestLocale = useLocale();

  return useMemo(
    () => ({
      push: (href: string) => {
        const locale = localeForNavigation(requestLocale, filingLocale);
        router.push(localizedRouterHref(href, locale));
      },
      replace: (href: string) => {
        const locale = localeForNavigation(requestLocale, filingLocale);
        router.replace(localizedRouterHref(href, locale));
      },
      prefetch: (href: string) => {
        const locale = localeForNavigation(requestLocale, filingLocale);
        router.prefetch(localizedRouterHref(href, locale));
      },
      back: () => router.back(),
      refresh: () => router.refresh(),
    }),
    [router, requestLocale, filingLocale],
  );
}

function localeForNavigation(requestLocale: string, filingLocale?: string | null) {
  if (typeof window !== 'undefined') {
    return localeFromPublicPath(window.location.pathname);
  }
  return pickLocale(requestLocale, filingLocale);
}
