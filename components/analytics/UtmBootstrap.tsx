'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { getClientUtmAttribution } from '@/lib/utm-client';
import { utmToAnalyticsProps } from '@/lib/utm';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * Registers lf_utm cookie values as PostHog super properties so every
 * pageview and funnel event carries campaign attribution — even after
 * internal redirects strip UTMs from the address bar.
 */
export function UtmBootstrap() {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    const utm = getClientUtmAttribution();
    if (!utm) return;
    posthog.register(utmToAnalyticsProps(utm));
  }, []);

  return null;
}
