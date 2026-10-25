'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { OpenAiPixel } from '@/components/analytics/OpenAiPixel';
import { openAiPixelBootstrap } from '@/lib/openai-pixel';
import { openAiPixelId } from '@/lib/tracking-ids';
import {
  AD_OPT_OUT_EVENT,
  clearGaDisableFlags,
  readAdOptOutCookieFromDocument,
  readGlobalPrivacyControl,
  shouldInjectAdScripts,
  syncGpcDerivedCookie,
  tearDownAdMeasurement,
} from '@/lib/ad-opt-out';

/**
 * Injects Google (gtag.js / GA4 / Google Ads) and the OpenAI ads pixel only
 * after a client check. The server passes `serverGpc` from `Sec-GPC: 1`.
 * The first render is always empty, so nothing is in the HTML to fire and
 * then stop. Opting out removes tags already added in this tab.
 */
export function AdMeasurementGate({
  serverGpc,
  serverCookie,
}: {
  serverGpc: boolean;
  serverCookie: string | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const clientChose = useRef(false);

  useEffect(() => {
    const sync = () => {
      syncGpcDerivedCookie(serverGpc || readGlobalPrivacyControl());
      const liveCookie = readAdOptOutCookieFromDocument();
      const cookie = clientChose.current ? liveCookie : (liveCookie ?? serverCookie);
      const allow = shouldInjectAdScripts({
        serverGpc,
        cookie,
        globalPrivacyControl: readGlobalPrivacyControl(),
      });
      if (!allow) {
        tearDownAdMeasurement();
        setEnabled(false);
        return;
      }
      clearGaDisableFlags();
      setEnabled(true);
    };
    const onChoice = () => {
      clientChose.current = true;
      sync();
    };
    window.addEventListener(AD_OPT_OUT_EVENT, onChoice);
    sync();
    return () => window.removeEventListener(AD_OPT_OUT_EVENT, onChoice);
  }, [serverGpc, serverCookie]);

  if (!enabled) return null;

  return (
    <>
      <GoogleAnalytics />
      <OpenAiPixelLoader />
      <OpenAiPixel />
    </>
  );
}

function OpenAiPixelLoader() {
  const pathname = usePathname();
  const id = openAiPixelId();
  if (!id || pathname === '/reset-password') return null;
  if (
    !shouldInjectAdScripts({
      cookie: readAdOptOutCookieFromDocument(),
      globalPrivacyControl: readGlobalPrivacyControl(),
    })
  ) {
    return null;
  }
  return (
    <Script id="openai-ads-pixel" strategy="afterInteractive">
      {openAiPixelBootstrap(id)}
    </Script>
  );
}
