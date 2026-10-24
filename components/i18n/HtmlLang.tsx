'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isSpanishPublicPath } from '@/lib/locale-paths';

/** Keep <html lang> in sync with the URL during client navigations. */
export function HtmlLang() {
  const pathname = usePathname() || '';

  useEffect(() => {
    const path = typeof window === 'undefined' ? pathname : window.location.pathname || pathname;
    document.documentElement.lang = isSpanishPublicPath(path) ? 'es' : 'en';
  }, [pathname]);

  return null;
}
