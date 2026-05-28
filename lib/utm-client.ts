'use client';

import { readUtmCookieValue, type UtmData } from '@/lib/utm';

/** Read persisted ad attribution from the browser cookie (client components). */
export function getClientUtmAttribution(): UtmData | null {
  if (typeof document === 'undefined') return null;
  return readUtmCookieValue(document.cookie);
}
