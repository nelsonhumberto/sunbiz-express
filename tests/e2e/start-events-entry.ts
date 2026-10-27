import posthog from 'posthog-js';
import { captureThenNavigate, filingIdFromWizardPath, startNavigationEvents } from '@/lib/analytics';

type TraceItem = { event: string; properties?: Record<string, unknown> };

declare global {
  interface Window {
    __runStart?: (
      redirectTo: string,
      locale: 'en' | 'es',
      entity: 'LLC' | 'CORP' | 'SCORP',
    ) => Promise<void>;
    __report?: (trace: TraceItem[]) => void;
  }
}

posthog.init('phc_e2e_start_events', {
  api_host: 'https://us.i.posthog.com',
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: true,
  advanced_disable_feature_flags: true,
  persistence: 'memory',
  request_batching: false,
  // Headless Chrome is classified as a bot. Without this, capture() drops the events.
  opt_out_useragent_filter: true,
});

window.__runStart = async (redirectTo, locale, entity) => {
  const trace: TraceItem[] = [];
  const original = posthog.capture.bind(posthog);
  posthog.capture = ((event: string, properties?: Record<string, unknown>, options?: object) => {
    trace.push({ event, properties });
    return original(event, properties, options);
  }) as typeof posthog.capture;
  const filingId = filingIdFromWizardPath(redirectTo);
  await captureThenNavigate({
    events: startNavigationEvents({ filingId, locale, entity }),
    navigate: () => {
      trace.push({ event: '__assign', properties: { href: redirectTo } });
      window.__report?.(trace);
      window.location.assign(redirectTo);
    },
  });
};
