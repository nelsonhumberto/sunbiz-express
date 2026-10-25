'use client';

import { useMemo } from 'react';
import { useRouter as useRawRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useRouter as useIntlRouter } from '@/i18n/navigation';
import { isSpanishHref } from '@/lib/app-href';
import { pickLocale } from '@/lib/pick-locale';

/**
 * next-intl router for wizard and auth navigation.
 * The filing's saved locale wins. An href that is already /es/... is
 * pushed unchanged.
 */
export function useLocalizedRouter(filingLocale?: string | null) {
  const intlRouter = useIntlRouter();
  const rawRouter = useRawRouter();
  const locale = pickLocale(useLocale(), filingLocale);

  return useMemo(
    () => ({
      push: (href: string) => {
        if (isSpanishHref(href)) rawRouter.push(href);
        else intlRouter.push(href, { locale });
      },
      replace: (href: string) => {
        if (isSpanishHref(href)) rawRouter.replace(href);
        else intlRouter.replace(href, { locale });
      },
      prefetch: (href: string) => {
        if (!isSpanishHref(href)) intlRouter.prefetch(href, { locale });
      },
      back: () => intlRouter.back(),
      refresh: () => intlRouter.refresh(),
    }),
    [intlRouter, rawRouter, locale],
  );
}
