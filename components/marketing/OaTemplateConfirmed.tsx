'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';

/** Fires once when a sample request is confirmed for the first time. */
export function OaTemplateConfirmed({ locale }: { locale: 'en' | 'es' }) {
  useEffect(() => {
    trackEvent('oa_template_confirmed', { locale, source: 'oa-template' }, { sendInstantly: true });
  }, [locale]);
  return null;
}
