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
import { ADS_CONSENT_EVENT, marketingTagsAllowed, readAdsConsent } from '@/lib/ad-consent';
import { adsDebugActive } from '@/lib/ads-conversions';
import {
  applyGoogleConsent,
  applyGoogleTesterRedaction,
  googleConsentChoice,
  isGoogleTesterBrowser,
  shouldLoadGoogleTags,
} from '@/lib/google-consent';

/**
 * Google (gtag.js / GA4 / Google Ads) loads before a cookie choice, in
 * Consent Mode with storage denied, unless the visitor is opted out.
 * OpenAI stays behind Accept via marketingTagsAllowed. The server passes
 * `serverGpc` from `Sec-GPC: 1`. The first render is empty, so nothing is in
 * the HTML to fire and then stop. Opting out removes tags already added.
 */
export function AdMeasurementGate({
  serverGpc,
  serverCookie,
}: {
  serverGpc: boolean;
  serverCookie: string | null;
}) {
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [openAiEnabled, setOpenAiEnabled] = useState(false);
  const clientChose = useRef(false);

  useEffect(() => {
    const sync = () => {
      syncGpcDerivedCookie(serverGpc || readGlobalPrivacyControl());
      const liveCookie = readAdOptOutCookieFromDocument();
      const cookie = clientChose.current ? liveCookie : (liveCookie ?? serverCookie);
      const optedOut = !shouldInjectAdScripts({
        serverGpc,
        cookie,
        globalPrivacyControl: readGlobalPrivacyControl(),
      });
      if (optedOut) {
        setGoogleEnabled(false);
        setOpenAiEnabled(false);
        try {
          tearDownAdMeasurement();
        } catch {
          // tearDown isolates its own steps. This keeps the listener in place.
        }
        return;
      }
      clearGaDisableFlags();
      const consent = readAdsConsent(document.cookie);
      const tester = isGoogleTesterBrowser();
      const adsDebug = adsDebugActive(window.location?.search ?? '');
      if (!shouldLoadGoogleTags({ optedOut: false, tester, adsDebug })) {
        setGoogleEnabled(false);
        setOpenAiEnabled(false);
        try {
          tearDownAdMeasurement();
        } catch {
          // A tester browser must not keep a tag that already loaded.
        }
        return;
      }
      setGoogleEnabled(true);
      setOpenAiEnabled(marketingTagsAllowed({ consent, optedOut: false, tester }));
      applyGoogleConsent(googleConsentChoice({ consent, optedOut: false, tester }));
      if (tester) applyGoogleTesterRedaction();
    };
    const onChoice = () => {
      clientChose.current = true;
      sync();
    };
    window.addEventListener(AD_OPT_OUT_EVENT, onChoice);
    window.addEventListener(ADS_CONSENT_EVENT, onChoice);
    sync();
    return () => {
      window.removeEventListener(AD_OPT_OUT_EVENT, onChoice);
      window.removeEventListener(ADS_CONSENT_EVENT, onChoice);
    };
  }, [serverGpc, serverCookie]);

  return (
    <>
      {googleEnabled ? <GoogleAnalytics /> : null}
      {openAiEnabled ? (
        <>
          <OpenAiPixelLoader />
          <OpenAiPixel />
        </>
      ) : null}
    </>
  );
}

function OpenAiPixelLoader() {
  const pathname = usePathname();
  const id = openAiPixelId();
  if (!id || pathname === '/reset-password') return null;
  const optedOut = !shouldInjectAdScripts({
    cookie: readAdOptOutCookieFromDocument(),
    globalPrivacyControl: readGlobalPrivacyControl(),
  });
  if (
    !marketingTagsAllowed({
      consent: readAdsConsent(typeof document === 'undefined' ? '' : document.cookie),
      optedOut,
      tester: isGoogleTesterBrowser(),
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
