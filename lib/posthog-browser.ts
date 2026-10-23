'use client';

import posthog from 'posthog-js';
import type { CaptureResult } from 'posthog-js';
import { definedAttributionProps } from '@/lib/utm';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

const SKIP_ATTRIBUTION_EVENTS = new Set(['$snapshot', '$$heatmap', '$heatmaps_data', '$web_vitals']);

/** UTMs and click IDs from the current URL, overlaid on the `lf_utm` cookie. */
export function currentAttributionProps(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return definedAttributionProps(window.location.search, document.cookie);
}

function withAttribution(event: CaptureResult | null): CaptureResult | null {
  if (!event?.properties || SKIP_ATTRIBUTION_EVENTS.has(event.event)) return event;
  const attribution = currentAttributionProps();
  if (Object.keys(attribution).length === 0) return event;
  return { ...event, properties: { ...event.properties, ...attribution } };
}

/**
 * Initialize before React effects. Child effects (the old manual $pageview)
 * ran before the provider effect, so the landing pageview was captured
 * against an uninitialized client and dropped. `capture_pageview:
 * 'history_change'` still records the initial view (any truthy setting does)
 * and later pathname changes. Replay stays on the SDK default (project
 * controlled); this file does not set `disable_session_recording`.
 */
if (typeof window !== 'undefined' && POSTHOG_KEY && !posthog.__loaded) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    before_send: withAttribution,
    loaded: (client) => {
      const attribution = currentAttributionProps();
      if (Object.keys(attribution).length > 0) client.register(attribution);
    },
  });
}
