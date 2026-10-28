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
    __beacons?: { url: string; data?: Blob | ArrayBuffer | string }[];
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

async function beaconPayloads(): Promise<{ url: string; base64: string }[]> {
  const items = window.__beacons ?? [];
  const payloads: { url: string; base64: string }[] = [];
  for (const item of items) {
    const data = item.data;
    let bytes: Uint8Array;
    if (typeof data === 'string') bytes = new TextEncoder().encode(data);
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
    else continue;
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    payloads.push({ url: item.url, base64: btoa(binary) });
  }
  return payloads;
}

window.__runStart = async (redirectTo, locale, entity) => {
  const trace: TraceItem[] = [];
  const started = performance.now();
  const original = posthog.capture.bind(posthog);
  posthog.capture = ((event: string, properties?: Record<string, unknown>, options?: object) => {
    trace.push({ event, properties });
    return original(event, properties, options);
  }) as typeof posthog.capture;
  const filingId = filingIdFromWizardPath(redirectTo);
  await captureThenNavigate({
    events: startNavigationEvents({ filingId, locale, entity }),
    navigate: () => {
      void (async () => {
        let beacons: { url: string; base64: string }[] = [];
        try {
          beacons = await beaconPayloads();
        } catch {
          beacons = [];
        }
        trace.push({
          event: '__assign',
          properties: {
            href: redirectTo,
            elapsedMs: Math.round(performance.now() - started),
            beacons,
          },
        });
        window.__report?.(trace);
        window.location.assign(redirectTo);
      })();
    },
  });
};
