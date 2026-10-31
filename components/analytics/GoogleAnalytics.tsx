'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { flushPendingAdsConversions } from '@/lib/analytics';
import { googleTagBootstrap, googleTagLoaderId } from '@/lib/google-consent';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

// Pages whose URL carries a secret token. GA records full URLs (query string
// included), so it is not loaded on them at all.
const UNTRACKED_PATHS = new Set(['/reset-password']);

/**
 * Loads gtag.js for every visitor the gate mounts, before a cookie choice.
 * Consent default is denied and runs before config. A stored Accept is
 * granted before config. Pageviews and queued Ads hits then fire in that state.
 *
 * No-op when neither measurement id is set (local dev, a preview without the
 * Production env vars).
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const untracked = UNTRACKED_PATHS.has(pathname);
  const loaderId = googleTagLoaderId(GA_MEASUREMENT_ID, GOOGLE_ADS_ID);

  // Manual SPA pageviews. send_page_view is false so the initial load isn't
  // double-counted; this effect fires page_view on navigation (and once on
  // mount). `li_fat_id` is dropped from the hit. utm params and gclid stay.
  useEffect(() => {
    if (!loaderId || untracked) return;
    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled || isClientAdMeasurementOptedOut()) return;
      if (typeof window.gtag === 'function') {
        flushPendingAdsConversions();
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.delete('li_fat_id');
        const query = params.toString();
        let url = pathname;
        if (query) url += `?${query}`;
        window.gtag('event', 'page_view', {
          page_path: url,
          page_location: window.location.origin + url,
        });
        return;
      }
      if (Date.now() - start >= 4000) return;
      window.setTimeout(tick, 150);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams, untracked, loaderId]);

  if (!loaderId || untracked) return null;
  if (typeof document !== 'undefined' && isClientAdMeasurementOptedOut()) return null;

  return (
    <>
      <Script id="google-analytics" strategy="afterInteractive">
        {googleTagBootstrap({ gaId: GA_MEASUREMENT_ID, adsId: GOOGLE_ADS_ID })}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${loaderId}`}
        strategy="afterInteractive"
      />
    </>
  );
}
