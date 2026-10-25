'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { LI_FAT_ID_STRIP_SCRIPT } from '@/lib/strip-li-fat-id';
import { isLaunchBundlePath } from '@/lib/launch-bundle';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

// Pages whose URL carries a secret token. GA records full URLs (query string
// included), so it is not loaded on them at all.
const UNTRACKED_PATHS = new Set(['/reset-password']);

/**
 * Loads Google Analytics 4 (gtag.js) sitewide and configures SPA pageview
 * tracking. Also configures the Google Ads tag on the same gtag instance
 * when an Ads ID is present, so Ads conversions can be attributed.
 *
 * All of this is a no-op when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset, so the
 * app runs fine without analytics configured (local dev, previews).
 * AdMeasurementGate is what decides whether this component mounts at all.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const untracked = UNTRACKED_PATHS.has(pathname);
  // EIN is restricted in Google Ads. The launch bundle is direct-link only,
  // so the Ads tag is not configured on this path. PostHog still loads.
  const suppressGoogleAds = isLaunchBundlePath(pathname);

  // Manual SPA pageviews. We init gtag with send_page_view:false below so the
  // initial load isn't double-counted; this effect fires the page_view on
  // every client-side navigation (and once on mount). `li_fat_id` is dropped
  // from the hit. utm params and gclid stay.
  useEffect(() => {
    if (!GA_MEASUREMENT_ID || untracked) return;
    let cancelled = false;
    const start = Date.now();
    const tick = () => {
      if (cancelled || isClientAdMeasurementOptedOut()) return;
      if (typeof window.gtag === 'function') {
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
  }, [pathname, searchParams, untracked]);

  if (!GA_MEASUREMENT_ID || untracked) return null;
  if (typeof document !== 'undefined' && isClientAdMeasurementOptedOut()) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          ${LI_FAT_ID_STRIP_SCRIPT}
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
          ${GOOGLE_ADS_ID && !suppressGoogleAds ? `gtag('config', '${GOOGLE_ADS_ID}');` : ''}
        `}
      </Script>
    </>
  );
}
