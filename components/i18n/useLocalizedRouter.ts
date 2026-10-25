'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { localizedRouterHref } from '@/lib/app-href';
import { pickLocale } from '@/lib/pick-locale';

export { localizedRouterHref } from '@/lib/app-href';

/**
 * Wizard and auth navigation. The filing's saved locale wins.
 * English hrefs stay unprefixed. Spanish hrefs stay under /es.
 * The next-intl router is not used: passing locale "en" adds /en.
 */
export function useLocalizedRouter(filingLocale?: string | null) {
  const router = useRouter();
  const locale = pickLocale(useLocale(), filingLocale);

  return useMemo(
    () => ({
      push: (href: string) => {
        router.push(localizedRouterHref(href, locale));
      },
      replace: (href: string) => {
        router.replace(localizedRouterHref(href, locale));
      },
      prefetch: (href: string) => {
        router.prefetch(localizedRouterHref(href, locale));
      },
      back: () => router.back(),
      refresh: () => router.refresh(),
    }),
    [router, locale],
  );
}
