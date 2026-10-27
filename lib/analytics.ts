/**
 * Lightweight analytics helpers wrapping PostHog (client-side) and providing
 * a unified event taxonomy. When NEXT_PUBLIC_POSTHOG_KEY is not set, all
 * calls are safe no-ops so the app never breaks without analytics configured.
 */

import posthog from 'posthog-js';

import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import { definedAttributionProps } from '@/lib/utm';

function ph() {
  if (typeof window === 'undefined') return null;
  if (!posthog?.__loaded) return null;
  return posthog;
}

function attributionProps(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return definedAttributionProps(window.location.search, document.cookie);
}

export type TrackEventOptions = {
  /** Skip the batch queue and send this event on its own. */
  sendInstantly?: boolean;
  /** `sendBeacon` can finish while the document is unloading. */
  transport?: 'sendBeacon';
};

/** Options passed through to `posthog.capture`. Empty options stay omitted. */
export function posthogCaptureOptions(
  options?: TrackEventOptions,
): { send_instantly?: true; transport?: 'sendBeacon' } | undefined {
  if (!options?.sendInstantly && !options?.transport) return undefined;
  const capture: { send_instantly?: true; transport?: 'sendBeacon' } = {};
  if (options.sendInstantly) capture.send_instantly = true;
  if (options.transport) capture.transport = options.transport;
  return capture;
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  options?: TrackEventOptions,
) {
  const explicit = properties
    ? Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined))
    : undefined;
  ph()?.capture(event, { ...attributionProps(), ...explicit }, posthogCaptureOptions(options));
}

/** Current PostHog distinct id, when the browser SDK has loaded. */
export function getAnalyticsDistinctId(): string | undefined {
  const id = ph()?.get_distinct_id?.();
  if (typeof id !== 'string') return undefined;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 200) return undefined;
  return trimmed;
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  ph()?.identify(userId, traits);
}

/**
 * Mark the current browser as internal traffic. `register` stamps later
 * events. `identify` and `setPersonProperties` set the person property so
 * the account can be filtered out.
 */
export function markInternalTraffic(userId?: string | null, email?: string | null) {
  const apply = () => {
    const client = ph();
    if (!client) return;
    client.register({ is_internal: true });
    if (!userId?.trim()) return;
    const traits: Record<string, unknown> = { is_internal: true };
    if (email?.trim()) traits.email = email.trim();
    client.identify(userId, traits);
    client.setPersonProperties?.({ is_internal: true });
  };
  if (ph()) {
    apply();
    return;
  }
  whenReady(() => Boolean(ph()), apply);
}

export function resetAnalytics() {
  ph()?.reset();
}

// ── Typed event helpers (match the taxonomy from the audit) ──────────────

export function trackCtaClicked(ctaId: string, extra?: Record<string, unknown>) {
  trackEvent('cta_clicked', { cta_id: ctaId, ...extra });
}

export function trackTierSelected(tier: string, state: string, entityType: string, source: string) {
  trackEvent('tier_selected', { tier, state, entity_type: entityType, source });
}

export function trackSignupStarted(extra?: Record<string, unknown>) {
  trackEvent('signup_started', extra);
}

/**
 * Properties for the PostHog `purchase_completed` capture on checkout success.
 * Amount and currency come from the verified Checkout Session (minor units
 * for `revenue_cents`, major units for `value`).
 */
export function purchaseCompletedEventProperties(input: {
  filingId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  state?: string | null;
  entityType?: string | null;
  tier?: string | null;
}): Record<string, string | number> {
  const properties: Record<string, string | number> = {};
  if (input.filingId) {
    properties.filing_id = input.filingId;
    properties.order_id = input.filingId;
  }
  if (typeof input.amountCents === 'number' && Number.isFinite(input.amountCents)) {
    properties.revenue_cents = input.amountCents;
    properties.value = input.amountCents / 100;
  }
  if (input.currency) properties.currency = input.currency;
  if (input.state) properties.state = input.state;
  if (input.entityType) properties.entity_type = input.entityType;
  if (input.tier) properties.tier = input.tier;
  return properties;
}

export function trackPurchaseCompleted(extra?: Record<string, unknown>) {
  trackEvent('purchase_completed', extra);
}

const CHECKOUT_SUCCESS_VIEW_PREFIX = 'lf_checkout_success_viewed:';

/** localStorage key so /checkout/success fires once per filing in this browser. */
export function checkoutSuccessViewStorageKey(filingId: string): string {
  return `${CHECKOUT_SUCCESS_VIEW_PREFIX}${filingId}`;
}

export function checkoutSuccessAlreadyViewed(filingId: string): boolean {
  if (typeof window === 'undefined' || !filingId) return false;
  try {
    return window.localStorage.getItem(checkoutSuccessViewStorageKey(filingId)) === '1';
  } catch {
    return false;
  }
}

export function markCheckoutSuccessViewed(filingId: string): void {
  if (typeof window === 'undefined' || !filingId) return;
  try {
    window.localStorage.setItem(checkoutSuccessViewStorageKey(filingId), '1');
  } catch {
    /* private mode: the component ref still blocks a second fire in this mount */
  }
}

/** Filing id from `/wizard/:id` or `/es/wizard/:id`. */
export function filingIdFromWizardPath(href: string | null | undefined): string | null {
  if (!href) return null;
  const path = href.startsWith('http')
    ? (() => {
        try {
          return new URL(href).pathname;
        } catch {
          return href;
        }
      })()
    : href.split('?')[0] ?? href;
  const match = path.match(/\/wizard\/([^/?#]+)/);
  const id = match?.[1]?.trim() ?? '';
  return id || null;
}

/**
 * Checkout and start events. Only these keys are sent. No email, no name.
 * `amount` is the server total in dollars. `is_test` is omitted when unknown.
 * Callers go through `trackEvent`, which no-ops until PostHog is loaded.
 */
export function checkoutFunnelEventProperties(input: {
  filingId?: string | null;
  plan?: string | null;
  amountCents?: number | null;
  locale?: string | null;
  isTest?: boolean | null;
}): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {};
  if (input.filingId) properties.filing_id = input.filingId;
  if (input.plan) properties.plan = input.plan;
  if (typeof input.amountCents === 'number' && Number.isFinite(input.amountCents)) {
    properties.amount = input.amountCents / 100;
  }
  if (input.locale === 'en' || input.locale === 'es') properties.locale = input.locale;
  if (typeof input.isTest === 'boolean') properties.is_test = input.isTest;
  return properties;
}

export function startNameSubmittedProperties(input: {
  filingId?: string | null;
  locale?: string | null;
}): Record<string, string> {
  const properties: Record<string, string> = {};
  if (input.filingId) properties.filing_id = input.filingId;
  if (input.locale === 'en' || input.locale === 'es') properties.locale = input.locale;
  return properties;
}

/** Step 1 continue. Same allowlist as the name submit: filing id and locale. */
export function wizardStep1ContinueProperties(input: {
  filingId?: string | null;
  locale?: string | null;
}): Record<string, string> {
  return startNameSubmittedProperties(input);
}

/**
 * Formation type only. A business name, email, or any other string is dropped.
 * `entity` is the one key past the checkout allowlist, and only on this event.
 */
export function wizardEntitySelectedProperties(input: {
  filingId?: string | null;
  locale?: string | null;
  entity?: string | null;
}): Record<string, string> {
  const properties = startNameSubmittedProperties(input);
  if (input.entity === 'LLC' || input.entity === 'CORP' || input.entity === 'SCORP') {
    properties.entity = input.entity;
  }
  return properties;
}

export type StartNavigationEvent = {
  event: 'wizard_entity_selected' | 'wizard_step1_continue_clicked' | 'start_name_submitted';
  properties: Record<string, string>;
};

/**
 * Successful /start redirect, English and Spanish.
 * The page is one name form. LLC is preselected unless the visitor switched
 * to a corporation or opened a URL that already chose the type.
 * `wizard_step1_continue_clicked` is the step 1 completion event.
 */
export function startNavigationEvents(input: {
  filingId?: string | null;
  locale?: string | null;
  entity?: string | null;
}): StartNavigationEvent[] {
  return [
    {
      event: 'wizard_entity_selected',
      properties: wizardEntitySelectedProperties(input),
    },
    {
      event: 'start_name_submitted',
      properties: startNameSubmittedProperties(input),
    },
    {
      event: 'wizard_step1_continue_clicked',
      properties: wizardStep1ContinueProperties(input),
    },
  ];
}

/** Longest pause before a full-page navigation while analytics leaves the browser. */
export const NAVIGATION_FLUSH_MAX_MS = 300;

/** Capture options for an event that is followed by `location.assign`. */
export const BEFORE_NAVIGATION_CAPTURE: TrackEventOptions = {
  sendInstantly: true,
  transport: 'sendBeacon',
};

export function navigationFlushBudget(requested?: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return NAVIGATION_FLUSH_MAX_MS;
  if (requested <= 0) return 0;
  return Math.min(NAVIGATION_FLUSH_MAX_MS, requested);
}

type AnalyticsClient = {
  capture: (
    event: string,
    properties?: Record<string, unknown>,
    options?: { send_instantly?: boolean; transport?: 'sendBeacon' },
  ) => void;
  flush?: () => Promise<void> | void;
  config?: { api_transport?: string };
  _requestQueue?: { unload?: () => void };
  _retryQueue?: { unload?: () => void };
};

function analyticsClient(): AnalyticsClient | null {
  const client = ph();
  return client ? (client as unknown as AnalyticsClient) : null;
}

function canUseSendBeacon(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
}

/**
 * `posthog.capture` accepts `transport` but does not copy it onto the request.
 * The request uses `config.api_transport`, which defaults to fetch, and a
 * fetch is cancelled by the next full-page load. For these calls only, point
 * that setting at sendBeacon so the immediate send can finish on unload.
 */
function withNavigationTransport(run: () => void): boolean {
  const client = analyticsClient();
  if (!client?.config || !canUseSendBeacon()) {
    run();
    return false;
  }
  const previous = client.config.api_transport;
  client.config.api_transport = 'sendBeacon';
  try {
    run();
    return true;
  } finally {
    client.config.api_transport = previous;
  }
}

function beaconQueuedEvents(client: AnalyticsClient): void {
  try {
    client._requestQueue?.unload?.();
  } catch {
    /* a queue beacon must not block the redirect */
  }
  try {
    client._retryQueue?.unload?.();
  } catch {
    /* a retry beacon must not block the redirect */
  }
}

/**
 * Wait until PostHog flushes, or until the budget elapses.
 * Returns immediately when PostHog is missing or has no flush.
 */
export async function flushAnalyticsBeforeNavigation(maxWaitMs?: number): Promise<void> {
  const client = analyticsClient();
  const flush = client?.flush;
  if (!client || typeof flush !== 'function') return;
  const waitMs = navigationFlushBudget(maxWaitMs);
  if (waitMs <= 0) return;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve()
        .then(() => flush.call(client))
        .then(() => undefined)
        .catch(() => undefined),
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, waitMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Capture, then navigate. PostHog missing is a no-op and does not delay
 * navigation. A sendBeacon send does not wait. Otherwise a flush is bounded
 * by {@link NAVIGATION_FLUSH_MAX_MS}.
 */
export async function captureThenNavigate(input: {
  events: ReadonlyArray<{ event: string; properties?: Record<string, unknown> }>;
  navigate: () => void;
  maxWaitMs?: number;
}): Promise<void> {
  let sentWithBeacon = false;
  try {
    sentWithBeacon = withNavigationTransport(() => {
      for (const item of input.events) {
        try {
          trackEvent(item.event, item.properties, BEFORE_NAVIGATION_CAPTURE);
        } catch {
          /* one failed capture must not drop the redirect or the other events */
        }
      }
    });
    const client = analyticsClient();
    if (client) beaconQueuedEvents(client);
    if (!sentWithBeacon) {
      await flushAnalyticsBeforeNavigation(input.maxWaitMs);
    }
  } finally {
    input.navigate();
  }
}

// ── Google Analytics / Ads (gtag) ────────────────────────────────────────
//
// These fire on top of PostHog so Google Ads can attribute conversions. All
// calls are safe no-ops when gtag isn't loaded (env vars unset).

function gtag(): ((...args: unknown[]) => void) | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  return typeof fn === 'function' ? fn : null;
}

/**
 * Report a purchase to GA4 and (when configured) fire the Google Ads
 * conversion. `send_to` targets the Ads conversion action so Ads counts it
 * even though the GA4 `purchase` event is also recorded.
 */
function whenReady(ready: () => boolean, run: () => void, timeoutMs = 4000) {
  if (typeof window === 'undefined') return;
  const start = Date.now();
  const tick = () => {
    if (ready()) {
      run();
      return;
    }
    if (Date.now() - start >= timeoutMs) return;
    window.setTimeout(tick, 150);
  };
  tick();
}

export function trackGooglePurchase(input: {
  transactionId: string;
  valueCents: number;
  currency?: string;
}) {
  if (isClientAdMeasurementOptedOut()) return;
  const g = gtag();
  if (!g) return;

  const value = input.valueCents / 100;
  const currency = input.currency ?? 'USD';

  // GA4 ecommerce purchase event.
  g('event', 'purchase', {
    transaction_id: input.transactionId,
    value,
    currency,
  });

  // Google Ads conversion (only when both Ads ID + label are configured).
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL;
  if (adsId && label) {
    g('event', 'conversion', {
      send_to: `${adsId}/${label}`,
      transaction_id: input.transactionId,
      value,
      currency,
    });
  }
}

/** GA4 generate_lead, plus a Google Ads conversion when a lead label is set. */
export function trackGoogleLead(input?: { service?: string }) {
  if (isClientAdMeasurementOptedOut()) return;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_LEAD;
  whenReady(
    () => typeof window.gtag === 'function',
    () => {
      if (isClientAdMeasurementOptedOut()) return;
      window.gtag('event', 'generate_lead', input?.service ? { service: input.service } : {});
      if (adsId && label) {
        window.gtag('event', 'conversion', {
          send_to: `${adsId}/${label}`,
        });
      }
    },
  );
}

/** OpenAI Ads `lead_created` on the business-services thank-you page. */
export function trackOpenAiLead() {
  if (isClientAdMeasurementOptedOut()) return;
  whenReady(
    () => typeof window.oaiq === 'function',
    () => {
      if (isClientAdMeasurementOptedOut()) return;
      window.oaiq?.('measure', 'lead_created', { type: 'customer_action' });
    },
    10000,
  );
}

/** SPA page view after the pixel's init call, which already measures the first view. */
export function trackOpenAiPageView(path: string) {
  if (isClientAdMeasurementOptedOut()) return;
  const id = path.slice(0, 128) || 'page';
  whenReady(
    () => typeof window.oaiq === 'function',
    () => {
      if (isClientAdMeasurementOptedOut()) return;
      window.oaiq?.('measure', 'page_viewed', {
        type: 'contents',
        contents: [{ id, name: id, content_type: 'page' }],
      });
    },
  );
}

export function trackAddOnToggled(slug: string, action: 'added' | 'removed', tier: string, state: string) {
  trackEvent('add_on_toggled', { slug, action, tier, state });
}

/**
 * Dashboard add-on purchase. Same slug / action / tier / state shape as
 * {@link trackAddOnToggled}, plus the charged total. Kept off
 * `purchase_completed` so a later certificate order is not deduped against
 * the formation purchase.
 */
export function trackAddOnPurchased(input: {
  slug: string;
  tier: string;
  state: string;
  entityType: string;
  filingId: string;
  serviceCents: number;
  stateFeeCents: number;
  totalCents: number;
}) {
  trackEvent('add_on_purchased', {
    slug: input.slug,
    action: 'purchased',
    tier: input.tier,
    state: input.state,
    entity_type: input.entityType,
    filing_id: input.filingId,
    service_cents: input.serviceCents,
    state_fee_cents: input.stateFeeCents,
    revenue_cents: input.totalCents,
    value: input.totalCents / 100,
    currency: 'USD',
    surface: 'dashboard',
  });
}

export function trackStateSwitched(from: string, to: string, surface: string) {
  trackEvent('state_switched', { from_state: from, to_state: to, surface });
}
