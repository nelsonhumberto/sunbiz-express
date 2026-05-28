'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getClientUtmAttribution } from '@/lib/utm-client';
import { utmFromSearchParams, utmToAnalyticsProps } from '@/lib/utm';
import { UtmBootstrap } from '@/components/analytics/UtmBootstrap';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    let url = window.origin + pathname;
    if (searchParams?.toString()) url += `?${searchParams.toString()}`;

    const fromUrl = searchParams
      ? utmFromSearchParams(Object.fromEntries(searchParams.entries()))
      : null;
    const fromCookie = getClientUtmAttribution();
    const utmProps = utmToAnalyticsProps(fromUrl ?? fromCookie);

    posthog.capture('$pageview', { $current_url: url, ...utmProps });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
    });
  }, []);

  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <UtmBootstrap />
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}
