'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ADS_CONSENT_ALL,
  ADS_CONSENT_ESSENTIAL,
  ADS_CONSENT_EVENT,
  readAdsConsent,
  serializeAdsConsentCookie,
} from '@/lib/ad-consent';
import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';

/** Bottom bar until the visitor accepts or declines Google measurement. */
export function CookieConsentBar() {
  const t = useTranslations('cookieNotice');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isClientAdMeasurementOptedOut()) return;
    if (readAdsConsent(document.cookie)) return;
    setOpen(true);
  }, []);

  function choose(value: typeof ADS_CONSENT_ALL | typeof ADS_CONSENT_ESSENTIAL) {
    document.cookie = serializeAdsConsentCookie(value);
    window.dispatchEvent(new Event(ADS_CONSENT_EVENT));
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      data-testid="cookie-consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white px-3 py-2 shadow-lg"
      role="dialog"
      aria-label={t('label')}
    >
      <p className="text-xs leading-snug text-ink">{t('body')}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="h-10 flex-1 rounded-lg bg-primary text-sm font-semibold text-white"
          onClick={() => choose(ADS_CONSENT_ALL)}
        >
          {t('accept')}
        </button>
        <button
          type="button"
          className="h-10 flex-1 rounded-lg border border-border text-sm font-semibold"
          onClick={() => choose(ADS_CONSENT_ESSENTIAL)}
        >
          {t('essential')}
        </button>
      </div>
    </div>
  );
}
