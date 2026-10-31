/**
 * Lightweight analytics helpers wrapping PostHog (client-side) and providing
 * a unified event taxonomy. When NEXT_PUBLIC_POSTHOG_KEY is not set, all
 * calls are safe no-ops so the app never breaks without analytics configured.
 */

import posthog from 'posthog-js';

import { isClientAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import {
  adsDebugActive,
  adsSendTo,
  beginConversionStorageKey,
  beginFilingPayload,
  isProductionAdsHost,
  purchaseConversionStorageKey,
  purchasePayload,
  qaCookieSuppressesAds,
  shouldSuppressAdsConversion,
  type AdsSuppressionInput,
} from '@/lib/ads-conversions';
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
/**
 * Tester accounts are filtered with the same PostHog flags as internal traffic.
 * `register` stamps later events. Person properties cover the account filter.
 */
export function markTesterTraffic(userId?: string | null) {
  const apply = () => {
    const client = ph();
    if (!client) return;
    client.register({ is_test: true, is_internal: true });
    client.setPersonProperties?.({ is_test: true, is_internal: true });
    if (!userId?.trim()) return;
    client.identify(userId, { is_test: true, is_internal: true });
  };
  if (ph()) {
    apply();
    return;
  }
  whenReady(() => Boolean(ph()), apply);
}

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

const CHECKOUT_PAID_PREFIX = 'lf_checkout_paid:';
const PURCHASE_COMPLETED_PREFIX = 'lf_purchase_completed:';

export function checkoutPaidStorageKey(filingId: string): string {
  return `${CHECKOUT_PAID_PREFIX}${filingId}`;
}

export function purchaseCompletedStorageKey(filingId: string): string {
  return `${PURCHASE_COMPLETED_PREFIX}${filingId}`;
}

function filingEventAlreadySent(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function markFilingEventSent(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode: a later full reload may send again */
  }
}

export function checkoutPaidAlreadySent(filingId: string): boolean {
  if (!filingId) return false;
  return filingEventAlreadySent(checkoutPaidStorageKey(filingId));
}

export function markCheckoutPaidSent(filingId: string): void {
  if (!filingId) return;
  markFilingEventSent(checkoutPaidStorageKey(filingId));
}

export function purchaseCompletedAlreadySent(filingId: string): boolean {
  if (!filingId) return false;
  return filingEventAlreadySent(purchaseCompletedStorageKey(filingId));
}

export function markPurchaseCompletedSent(filingId: string): void {
  if (!filingId) return;
  markFilingEventSent(purchaseCompletedStorageKey(filingId));
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
  event:
    | 'wizard_entity_selected'
    | 'wizard_step1_continue_clicked'
    | 'start_name_submitted'
    | 'start_name_later';
  properties: Record<string, string | boolean>;
};

/** Present only when Florida + LLC was preselected for this visit. */
export function preselectedEventProps(
  preselected?: boolean,
): { preselected: true } | Record<string, never> {
  return preselected ? { preselected: true } : {};
}

/**
 * Successful /start redirect, English and Spanish.
 * The page is one name form. LLC is preselected unless the visitor switched
 * to a corporation or opened a URL that already chose the type.
 * `wizard_step1_continue_clicked` is the step 1 completion event.
 * Florida LLC landing traffic and utm_source=google add preselected=true.
 * Continuing without a name adds the start_name_later event.
 */
export function startNavigationEvents(input: {
  filingId?: string | null;
  locale?: string | null;
  entity?: string | null;
  preselected?: boolean;
  nameLater?: boolean;
}): StartNavigationEvent[] {
  const stamp = (properties: Record<string, string>): Record<string, string | boolean> => ({
    ...properties,
    ...preselectedEventProps(input.preselected),
  });
  const events: StartNavigationEvent[] = [
    {
      event: 'wizard_entity_selected',
      properties: stamp(wizardEntitySelectedProperties(input)),
    },
    {
      event: 'start_name_submitted',
      properties: stamp(startNameSubmittedProperties(input)),
    },
    {
      event: 'wizard_step1_continue_clicked',
      properties: stamp(wizardStep1ContinueProperties(input)),
    },
  ];
  if (input.nameLater) {
    events.push({
      event: 'start_name_later',
      properties: {
        ...stamp(startNameSubmittedProperties(input)),
        name_later: true,
      },
    });
  }
  return events;
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

type CaptureRequest = {
  callback?: (response: unknown) => void;
};

type AnalyticsClient = {
  capture: (
    event: string,
    properties?: Record<string, unknown>,
    options?: { send_instantly?: boolean; transport?: 'sendBeacon' },
  ) => void;
  config?: { api_transport?: string };
  _requestQueue?: { unload?: () => void };
  _retryQueue?: { unload?: () => void };
  _send_retriable_request?: (options: CaptureRequest) => void;
  _send_request?: (options: CaptureRequest) => void;
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
 * Watch the request callback posthog-js runs after a capture is sent.
 * posthog-js 1.373.2 has no flush(), and sendBeacon never calls this callback.
 * Returns null when the client has no send method to wrap.
 */
function listenForCaptureSend(client: AnalyticsClient): { sent: Promise<void>; restore: () => void } | null {
  const key =
    typeof client._send_retriable_request === 'function'
      ? '_send_retriable_request'
      : typeof client._send_request === 'function'
        ? '_send_request'
        : null;
  if (!key) return null;
  const original = client[key];
  if (typeof original !== 'function') return null;
  let pending = 0;
  let settled = false;
  let resolveSent: () => void = () => undefined;
  const sent = new Promise<void>((resolve) => {
    resolveSent = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
  });
  const wrapped = (options?: CaptureRequest) => {
    pending += 1;
    const next: CaptureRequest = { ...(options ?? {}) };
    const previous = next.callback;
    next.callback = (response: unknown) => {
      try {
        previous?.(response);
      } finally {
        pending -= 1;
        if (pending <= 0) resolveSent();
      }
    };
    return original.call(client, next);
  };
  client[key] = wrapped;
  return {
    sent,
    restore: () => {
      if (client[key] === wrapped) client[key] = original;
    },
  };
}

/**
 * Wait until every capture callback has fired, or until the budget elapses.
 * posthog-js 1.373.2 has no flush(), so a missing callback is not an instant
 * return. PostHog missing does not wait. The budget never exceeds
 * {@link NAVIGATION_FLUSH_MAX_MS}.
 */
export async function flushAnalyticsBeforeNavigation(
  maxWaitMs?: number,
  sent?: Promise<void>,
): Promise<void> {
  const client = analyticsClient();
  if (!client) return;
  const waitMs = navigationFlushBudget(maxWaitMs);
  if (waitMs <= 0) return;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sent ?? new Promise<void>(() => undefined),
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
 * navigation. A sendBeacon send does not wait, because the beacon is already
 * queued. Otherwise navigation waits for the capture callback, and still runs
 * once {@link NAVIGATION_FLUSH_MAX_MS} elapses if that callback never fires.
 */
export async function captureThenNavigate(input: {
  events: ReadonlyArray<{ event: string; properties?: Record<string, unknown> }>;
  navigate: () => void;
  maxWaitMs?: number;
}): Promise<void> {
  const client = analyticsClient();
  const listener = client ? listenForCaptureSend(client) : null;
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
    if (client) beaconQueuedEvents(client);
    if (!sentWithBeacon) {
      await flushAnalyticsBeforeNavigation(input.maxWaitMs, listener?.sent);
    }
  } finally {
    listener?.restore();
    input.navigate();
  }
}

// ── Google Analytics / Ads (gtag) ────────────────────────────────────────
//
// These fire on top of PostHog so Google Ads can attribute conversions. All
// calls are safe no-ops when gtag isn't loaded (env vars unset).

/** Poll until a client SDK has loaded. Ads conversions do not use this. */
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

function browserSearch(): string {
  try {
    return window.location?.search ?? '';
  } catch {
    return '';
  }
}

function browserCookie(): string {
  try {
    return document.cookie ?? '';
  } catch {
    return '';
  }
}

function readConversionFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeConversionFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode: Ads transaction_id still dedupes a later hit */
  }
}

function logAdsDebug(kind: string, payload: unknown): void {
  console.info(`[lf_ads_debug] ${kind}`, payload);
}

type PendingAdsConversion = {
  storageKey: string;
  kind: 'purchase' | 'begin';
  sendTo: string | null;
  value: number;
  currency: string;
  transactionId: string;
  debugLog: boolean;
};

/** Unsent hits only. A sent hit is removed so it cannot fire again. */
const PENDING_PREFIX = 'lf_ads_pending:';
/** Older purchase backlog, kept so a tab that queued before this deploy still flushes once. */
const LEGACY_PENDING_PURCHASE_PREFIX = 'lf_ads_pending_purchase:';

function gtagReady(): boolean {
  return typeof window.gtag === 'function';
}

function pendingStorageKey(storageKey: string): string {
  return `${PENDING_PREFIX}${storageKey}`;
}

function rememberPending(hit: PendingAdsConversion): void {
  try {
    window.sessionStorage.setItem(pendingStorageKey(hit.storageKey), JSON.stringify(hit));
  } catch {
    /* private mode cannot survive a full navigation */
  }
}

function forgetPending(hit: PendingAdsConversion): void {
  try {
    window.sessionStorage.removeItem(pendingStorageKey(hit.storageKey));
    window.sessionStorage.removeItem(`${LEGACY_PENDING_PURCHASE_PREFIX}${hit.transactionId}`);
    window.sessionStorage.removeItem(`${LEGACY_PENDING_PURCHASE_PREFIX}${hit.storageKey}`);
  } catch {
    /* ignore */
  }
}

function isPendingKey(key: string): boolean {
  return key.startsWith(PENDING_PREFIX) || key.startsWith(LEGACY_PENDING_PURCHASE_PREFIX);
}

function readPending(): PendingAdsConversion[] {
  const hits: PendingAdsConversion[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && isPendingKey(key)) keys.push(key);
    }
    for (const key of keys) {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as PendingAdsConversion;
      if (!parsed?.transactionId || !parsed.storageKey) continue;
      if (parsed.kind !== 'purchase' && parsed.kind !== 'begin') continue;
      hits.push(parsed);
    }
  } catch {
    /* ignore */
  }
  return hits;
}

function adsProduction(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
}

function browserHostname(): string {
  try {
    return window.location?.hostname ?? '';
  } catch {
    return '';
  }
}

/** A proof hit must be an lfdebug id on a non-production deploy. Anything else is dropped. */
function proofHitAllowed(hit: PendingAdsConversion): boolean {
  if (!hit.debugLog) return true;
  if (!hit.transactionId.startsWith('lfdebug-')) return false;
  if (adsProduction() || isProductionAdsHost(browserHostname())) return false;
  return adsDebugActive(browserSearch());
}

function sendAdsHit(hit: PendingAdsConversion): void {
  if (!gtagReady()) return;
  if (isClientAdMeasurementOptedOut()) return;
  if (!proofHitAllowed(hit)) {
    forgetPending(hit);
    return;
  }
  if (readConversionFlag(hit.storageKey)) {
    forgetPending(hit);
    return;
  }
  writeConversionFlag(hit.storageKey);
  if (hit.kind === 'purchase') {
    window.gtag('event', 'purchase', {
      transaction_id: hit.transactionId,
      value: hit.value,
      currency: hit.currency,
    });
  }
  if (hit.sendTo) {
    window.gtag('event', 'conversion', {
      send_to: hit.sendTo,
      transaction_id: hit.transactionId,
      value: hit.value,
      currency: hit.currency,
    });
    if (hit.debugLog) console.info(hit.sendTo);
  }
  forgetPending(hit);
}

/**
 * Send now. Consent Mode delivers the hit while storage is denied.
 * If gtag is not defined yet, keep the hit in sessionStorage so a navigation
 * to the wizard can flush it. Nothing waits for Accept.
 */
function deliverAdsHit(hit: PendingAdsConversion): void {
  if (readConversionFlag(hit.storageKey)) return;
  if (gtagReady()) {
    sendAdsHit(hit);
    return;
  }
  rememberPending(hit);
}

/** Send hits stored before gtag.js defined `window.gtag`. Opt-out stays off. */
export function flushPendingAdsConversions(): void {
  if (typeof window === 'undefined' || !gtagReady()) return;
  if (isClientAdMeasurementOptedOut()) return;
  for (const hit of readPending()) sendAdsHit(hit);
}

/** Test helper. Pending hits live in sessionStorage, which this does not clear. */
export function clearPendingAdsQueueForTests(): void {
  return;
}

function debugTransactionId(transactionId: string, bypass: boolean): string {
  if (!bypass) return transactionId;
  return transactionId.startsWith('lfdebug-') ? transactionId : `lfdebug-${transactionId}`;
}

function suppressionInput(
  input: AdsSuppressionInput & { email?: string | null },
): AdsSuppressionInput {
  const emails = [...(input.emails ?? [])];
  if (input.email) emails.push(input.email);
  return {
    isTester: input.isTester,
    isTest: input.isTest,
    qaMarked: input.qaMarked || qaCookieSuppressesAds(browserCookie()),
    emails,
  };
}

/**
 * GA4 `purchase` plus the Filing Purchase Ads conversion.
 * One hit per transaction id in this browser. Refreshing the receipt does not
 * send again. `transaction_id` is also sent for Ads-side dedup.
 * Test users are skipped. On a preview deploy, `?lf_ads_debug=1` sends that
 * skipped hit with an lfdebug- transaction id. Production cannot.
 */
export function trackGooglePurchase(input: {
  transactionId: string;
  valueCents: number;
  currency?: string;
  isTester?: boolean | null;
  isTest?: boolean | null;
  email?: string | null;
}) {
  if (typeof window === 'undefined') return;
  const payload = purchasePayload(input);
  if (!payload) return;

  const suppressed = shouldSuppressAdsConversion(suppressionInput(input));
  const debug = adsDebugActive(browserSearch());
  const bypass = debug && suppressed && !adsProduction() && !isProductionAdsHost(browserHostname());
  const sendTo = adsSendTo(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL,
  );
  const outboundId = debugTransactionId(payload.transaction_id, bypass);
  const storageKey = purchaseConversionStorageKey(outboundId);
  if (readConversionFlag(storageKey)) return;
  const conversion = sendTo
    ? { send_to: sendTo, transaction_id: outboundId, value: payload.value, currency: payload.currency }
    : null;

  if (suppressed && !bypass) {
    if (debug) logAdsDebug('purchase suppressed', { purchase: payload, conversion });
    return;
  }
  if (isClientAdMeasurementOptedOut()) return;

  deliverAdsHit({
    storageKey,
    kind: 'purchase',
    sendTo,
    value: payload.value,
    currency: payload.currency,
    transactionId: outboundId,
    debugLog: bypass,
  });
}

/**
 * Begin Filing Ads conversion. Once per filing id, on the /lp CTA and on
 * step 1 submit. The same id from the landing CTA into step 1 does not send
 * again. Value is 1 USD. Sends only when the Begin Filing label env is set.
 * The hit fires immediately, including while consent is denied. Test users
 * are skipped and do not consume the dedupe key.
 */
export function trackGoogleBeginFiling(input?: {
  filingId?: string | null;
  isTester?: boolean | null;
  isTest?: boolean | null;
  email?: string | null;
  emails?: Array<string | null | undefined>;
}) {
  if (typeof window === 'undefined') return;
  const base = beginFilingPayload(input?.filingId);
  if (!base) return;
  const suppressed = shouldSuppressAdsConversion(suppressionInput(input ?? {}));
  const debug = adsDebugActive(browserSearch());
  const bypass = debug && suppressed && !adsProduction() && !isProductionAdsHost(browserHostname());
  const outboundId = debugTransactionId(base.transaction_id, bypass);
  const storageKey = beginConversionStorageKey(outboundId);
  if (readConversionFlag(storageKey)) return;

  const sendTo = adsSendTo(
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING,
  );
  const payload = sendTo
    ? { send_to: sendTo, transaction_id: outboundId, value: base.value, currency: base.currency }
    : null;

  if (suppressed && !bypass) {
    if (debug) logAdsDebug('begin_filing suppressed', payload ?? { missingLabel: true });
    return;
  }
  if (isClientAdMeasurementOptedOut()) return;
  if (!payload || !sendTo) {
    if (debug) logAdsDebug('begin_filing missing label', { missingLabel: true });
    return;
  }

  deliverAdsHit({
    storageKey,
    kind: 'begin',
    sendTo,
    value: base.value,
    currency: base.currency,
    transactionId: outboundId,
    debugLog: bypass,
  });
}

/** GA4 generate_lead, plus a Google Ads conversion when a lead label is set. */
export function trackGoogleLead(input?: { service?: string }) {
  if (isClientAdMeasurementOptedOut()) return;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_LEAD;
  const suppressConversion = shouldSuppressAdsConversion(suppressionInput({}));
  whenReady(
    () => typeof window.gtag === 'function',
    () => {
      if (isClientAdMeasurementOptedOut()) return;
      window.gtag('event', 'generate_lead', input?.service ? { service: input.service } : {});
      if (suppressConversion || shouldSuppressAdsConversion(suppressionInput({}))) return;
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
