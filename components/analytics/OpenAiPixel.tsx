'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackOpenAiPageView } from '@/lib/analytics';
import { openAiPixelId } from '@/lib/tracking-ids';

const PIXEL_ID = openAiPixelId();

const UNTRACKED_PATHS = new Set(['/reset-password']);

/**
 * SPA `page_viewed` events for the OpenAI Ads pixel.
 *
 * The SDK loader runs only after Accept, from AdMeasurementGate.
 * Init does not emit `page_viewed` or `lead_created`. `lead_created` is
 * sent from the business-services thank-you page (English and `/es/...`).
 */
export function OpenAiPixel() {
  const pathname = usePathname();
  const untracked = UNTRACKED_PATHS.has(pathname);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!PIXEL_ID || untracked) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackOpenAiPageView(pathname);
  }, [pathname, untracked]);

  return null;
}
