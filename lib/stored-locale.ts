import 'server-only';

import { headers } from 'next/headers';
import { LOCALE_HEADER, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { resolveRequestLocale } from '@/lib/request-locale';

/**
 * Site language for this request, stored on the user and the new filing.
 * The URL path wins. A server action often cannot see the middleware
 * rewrite headers, so the address bar (browser path, Referer, next-url)
 * is read directly. NEXT_LOCALE and Accept-Language are not consulted.
 * Returns null outside a request so email jobs can keep the filing locale.
 */
export async function storedLocale(browserPath?: string | null): Promise<'en' | 'es' | null> {
  try {
    const headerStore = headers();
    return resolveRequestLocale({
      browserPath,
      publicPath: headerStore.get(PUBLIC_PATH_HEADER),
      nextUrl: headerStore.get('next-url'),
      referer: headerStore.get('referer'),
      localeHeader: headerStore.get(LOCALE_HEADER),
      allowedHost: headerStore.get('host'),
      serverAction: Boolean(headerStore.get('next-action')) || Boolean(browserPath),
    });
  } catch {
    return resolveRequestLocale({ browserPath });
  }
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
