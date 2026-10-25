import 'server-only';

import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { LOCALE_HEADER, localeFromPublicPath, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';

/**
 * Site language for this request, stored on the user and the new filing.
 * The public path wins, same as i18n/request.ts, so a server action whose
 * getLocale() falls back to English still records Spanish for /es.
 */
export async function storedLocale(): Promise<'en' | 'es' | null> {
  try {
    const path = headers().get(PUBLIC_PATH_HEADER);
    if (path) return localeFromPublicPath(path);
  } catch {
    /* headers() is unavailable outside a request */
  }
  try {
    const hinted = headers().get(LOCALE_HEADER);
    if (hinted === 'en' || hinted === 'es') return hinted;
  } catch {
    /* ignore */
  }
  try {
    const locale = await getLocale();
    if (locale === 'en' || locale === 'es') return locale;
  } catch {
    /* ignore */
  }
  return null;
}

/** Public path for this request, including a leading /es when present. */
export function storedEntryPath(): string | null {
  try {
    const value = headers().get(PUBLIC_PATH_HEADER);
    if (!value) return null;
    const path = (value.split('?')[0] ?? value).split('#')[0]?.trim() ?? '';
    if (!path.startsWith('/') || path.length > 500) return null;
    return path;
  } catch {
    return null;
  }
}
