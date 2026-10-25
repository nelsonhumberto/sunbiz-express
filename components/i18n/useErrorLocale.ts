'use client';

import { useEffect, useState } from 'react';
import { localeFromPathname, type ErrorPageLocale } from '@/lib/error-page-copy';

/**
 * Locale from the public URL. The first render stays English so the
 * server HTML and the hydration pass match. global-error has no intl provider.
 */
export function useErrorLocale(): ErrorPageLocale {
  const [locale, setLocale] = useState<ErrorPageLocale>('en');
  useEffect(() => {
    setLocale(localeFromPathname(window.location.pathname));
  }, []);
  return locale;
}
