import 'server-only';

import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { PUBLIC_PATH_HEADER } from '@/lib/locale-paths';

/** Site language for this request, stored on the user and the new filing. */
export async function storedLocale(): Promise<'en' | 'es' | null> {
  try {
    const locale = await getLocale();
    if (locale === 'en' || locale === 'es') return locale;
    return null;
  } catch {
    return null;
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
