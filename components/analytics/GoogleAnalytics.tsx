'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

/**
 * Loads Google Analytics 4 (gtag.js) sitewide and configures SPA pageview
 * tracking. Also configures the Google Ads tag on the same gtag instance
 * when an Ads ID is present, so Ads conversions can be attributed.
 *
 * All of this is a no-op when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset, so the
 * app runs fine without analytics configured (local dev, previews).
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Manual SPA pageviews. We init gtag with send_page_view:false below so the
  // initial load isn't double-counted; this effect fires the page_view on
  // every client-side navigation (and once on mount).
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

    let url = pathname;
    if (searchParams?.toString()) url += `?${searchParams.toString()}`;

    window.gtag('event', 'page_view', {
      page_path: url,
      page_location: window.location.origin + url,
    });
  }, [pathname, searchParams]);

  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
          ${GOOGLE_ADS_ID ? `gtag('config', '${GOOGLE_ADS_ID}');` : ''}
        `}
      </Script>
    </>
  );
}
