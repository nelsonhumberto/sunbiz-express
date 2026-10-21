'use client';

import Script from 'next/script';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackOpenAiPageView } from '@/lib/analytics';
import { openAiPixelId } from '@/lib/tracking-ids';

const PIXEL_ID = openAiPixelId();

const UNTRACKED_PATHS = new Set(['/reset-password']);

/**
 * OpenAI Ads Measurement Pixel, installed from the official snippet:
 * https://developers.openai.com/ads/measurement-pixel
 *
 * nelsonhumberto's GitHub has no Cafecito TECH site repo to copy. The same
 * loader and pixel ID are on https://cafecitotech.com. `oaiq("init")` already
 * measures the first view; later client navigations send `page_viewed`.
 * `lead_created` is fired from the thank-you page, not here.
 */
export function OpenAiPixel() {
  const pathname = usePathname();
  const untracked = UNTRACKED_PATHS.has(pathname);
  const skippedFirstView = useRef(false);

  useEffect(() => {
    if (!PIXEL_ID || untracked) return;
    if (!skippedFirstView.current) {
      skippedFirstView.current = true;
      return;
    }
    trackOpenAiPageView(pathname);
  }, [pathname, untracked]);

  if (!PIXEL_ID || untracked) return null;

  return (
    <Script id="openai-ads-pixel" strategy="afterInteractive">
      {`
        (function (w, d, s, u) {
          if (w.oaiq) return;
          var q = function () { q.q.push(arguments); };
          q.q = [];
          w.oaiq = q;
          var js = d.createElement(s);
          js.async = true;
          js.src = u;
          var f = d.getElementsByTagName(s)[0];
          f.parentNode.insertBefore(js, f);
        })(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");
        oaiq("init", { pixelId: ${JSON.stringify(PIXEL_ID)} });
      `}
    </Script>
  );
}
