'use client';

import { useEffect, useRef, useState } from 'react';
import type { CookieNoticeCopy } from '@/lib/cookie-notice-locale';
import type { Locale } from '@/i18n/config';
import {
  ADS_CONSENT_ALL,
  ADS_CONSENT_ESSENTIAL,
  ADS_CONSENT_EVENT,
  readAdsConsent,
  serializeAdsConsentCookie,
  shouldShowCookieNotice,
} from '@/lib/ad-consent';
import { AD_OPT_OUT_EVENT, isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { localizedHref } from '@/lib/locale-paths';

const COOKIE_BAR_VAR = '--lf-cookie-h';

/** Slim bottom bar. Fixed, so it does not shift page content. Shown once. */
export function CookieConsentBar({
  locale,
  copy,
}: {
  /** Public-path language, so a client provider that hydrated in English cannot paint this bar in English on /es. */
  locale: Locale;
  copy: CookieNoticeCopy;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idle = 0;
    let fallback = 0;
    const evaluate = (immediate: boolean) => {
      const show = shouldShowCookieNotice({
        consent: readAdsConsent(document.cookie),
        optedOut: isClientAdMeasurementOptedOut(),
      });
      if (!show) {
        setOpen(false);
        return;
      }
      if (immediate) {
        setOpen(true);
        return;
      }
      const reveal = () => {
        if (!cancelled) setOpen(true);
      };
      const handle = window.requestIdleCallback?.(reveal, { timeout: 600 });
      idle = handle ?? 0;
      fallback =
        handle == null
          ? window.setTimeout(reveal, 0)
          : window.setTimeout(() => {
              /* idle callback covers the reveal */
            }, 0);
    };
    evaluate(false);
    const onOptOut = () => evaluate(true);
    window.addEventListener(AD_OPT_OUT_EVENT, onOptOut);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback?.(idle);
      window.clearTimeout(fallback);
      window.removeEventListener(AD_OPT_OUT_EVENT, onOptOut);
    };
  }, []);

  useEffect(() => {
    const node = barRef.current;
    if (!open || !node) {
      document.documentElement.style.setProperty(COOKIE_BAR_VAR, '0px');
      return;
    }
    const apply = () => {
      document.documentElement.style.setProperty(COOKIE_BAR_VAR, `${node.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty(COOKIE_BAR_VAR, '0px');
    };
  }, [open]);

  function choose(value: typeof ADS_CONSENT_ALL | typeof ADS_CONSENT_ESSENTIAL) {
    document.cookie = serializeAdsConsentCookie(value);
    window.dispatchEvent(new Event(ADS_CONSENT_EVENT));
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      ref={barRef}
      data-testid="cookie-consent"
      role="region"
      aria-label={copy.label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white px-2 py-0.5"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-tight text-ink">
          {copy.body}{' '}
          <a
            href={localizedHref('/privacy', locale)}
            className="font-semibold text-primary underline underline-offset-2"
          >
            {copy.privacy}
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="min-h-11 px-2 text-xs font-medium text-ink underline underline-offset-2"
            onClick={() => choose(ADS_CONSENT_ESSENTIAL)}
          >
            {copy.essential}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
            onClick={() => choose(ADS_CONSENT_ALL)}
          >
            {copy.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
