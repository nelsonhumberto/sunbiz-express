'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { localizedHref } from '@/lib/locale-paths';
import {
  AD_OPT_OUT_VALUE,
  readAdOptOutCookieFromDocument,
  readGlobalPrivacyControl,
  syncGpcDerivedCookie,
  writeClientAdOptOut,
} from '@/lib/ad-opt-out';
import { ADS_CONSENT_ALL, serializeAdsConsentCookie, ADS_CONSENT_EVENT } from '@/lib/ad-consent';

export function PrivacyChoicesPanel({
  initialOptedOut,
  serverGpc,
}: {
  initialOptedOut: boolean;
  serverGpc: boolean;
}) {
  const t = useTranslations('privacyChoices');
  const locale = useLocale();
  const [gpc, setGpc] = useState(serverGpc);
  const [optedOut, setOptedOut] = useState(initialOptedOut || serverGpc);

  useEffect(() => {
    const gpcOn = serverGpc || readGlobalPrivacyControl();
    syncGpcDerivedCookie(gpcOn);
    if (gpcOn) {
      setGpc(true);
      setOptedOut(true);
      return;
    }
    setGpc(false);
    setOptedOut(readAdOptOutCookieFromDocument() === AD_OPT_OUT_VALUE);
  }, [serverGpc]);

  function optOut() {
    writeClientAdOptOut(true);
    setOptedOut(true);
  }

  function optIn() {
    writeClientAdOptOut(false);
    document.cookie = serializeAdsConsentCookie(ADS_CONSENT_ALL);
    window.dispatchEvent(new Event(ADS_CONSENT_EVENT));
    setOptedOut(false);
  }

  return (
    <div className="not-prose space-y-6">
      <p className="text-ink-muted leading-relaxed">{t('intro')}</p>
      <p className="text-base font-medium text-ink" role="status">
        {optedOut ? t('statusOff') : t('statusOn')}
      </p>
      {gpc ? (
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-ink">{t('gpc')}</p>
      ) : (
        <Button type="button" variant={optedOut ? 'outline' : 'default'} onClick={optedOut ? optIn : optOut}>
          {optedOut ? t('optIn') : t('optOut')}
        </Button>
      )}
      <p className="text-sm text-ink-muted leading-relaxed">{t('stillRun')}</p>
      <p>
        <Link href={localizedHref('/privacy', locale)} className="text-primary underline">
          {t('privacyLink')}
        </Link>
      </p>
    </div>
  );
}
