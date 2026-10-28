'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  ADS_CONSENT_ALL,
  ADS_CONSENT_ESSENTIAL,
  ADS_CONSENT_EVENT,
  readAdsConsent,
  serializeAdsConsentCookie,
  shouldShowCookieNotice,
} from '@/lib/ad-consent';
import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { localizedHref } from '@/lib/locale-paths';

const COOKIE_BAR_VAR = '--lf-cookie-h';

/** Slim bottom bar. Fixed, so it does not shift page content. Shown once. */
export function CookieConsentBar() {
  const t = useTranslations('cookieNotice');
  const locale = useLocale();
  const barRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = shouldShowCookieNotice({
      consent: readAdsConsent(document.cookie),
      optedOut: isClientAdMeasurementOptedOut(),
    });
    if (!show) return;
    let cancelled = false;
    const reveal = () => {
      if (!cancelled) setOpen(true);
    };
    const idle = window.requestIdleCallback?.(reveal, { timeout: 600 });
    const fallback =
      idle == null
        ? window.setTimeout(reveal, 0)
        : window.setTimeout(() => {
            /* idle callback covers the reveal */
          }, 0);
    return () => {
      cancelled = true;
      if (idle != null) window.cancelIdleCallback?.(idle);
      window.clearTimeout(fallback);
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
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white px-3 py-1.5"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 basis-[12rem] text-[13px] leading-snug text-ink">
          {t('body')}{' '}
          <a
            href={localizedHref('/privacy', locale)}
            className="font-semibold text-primary underline underline-offset-2"
          >
            {t('privacy')}
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="min-h-11 px-2 text-xs font-medium text-ink underline underline-offset-2"
            onClick={() => choose(ADS_CONSENT_ESSENTIAL)}
          >
            {t('essential')}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
            onClick={() => choose(ADS_CONSENT_ALL)}
          >
            {t('accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
