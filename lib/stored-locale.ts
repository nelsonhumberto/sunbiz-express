import 'server-only';

import { getLocale } from 'next-intl/server';

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
