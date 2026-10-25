/**
 * Lightweight analytics helpers wrapping PostHog (client-side) and providing
 * a unified event taxonomy. When NEXT_PUBLIC_POSTHOG_KEY is not set, all
 * calls are safe no-ops so the app never breaks without analytics configured.
 */

import { definedAttributionProps } from '@/lib/utm';

let posthog: typeof import('posthog-js').default | null = null;

function ph() {
  if (typeof window === 'undefined') return null;
  if (!posthog) {
    try {
      posthog = require('posthog-js').default;
    } catch {
      return null;
    }
  }
  if (!posthog?.__loaded) return null;
  return posthog;
}

function attributionProps(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return definedAttributionProps(window.location.search, document.cookie);
}

export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  options?: { sendInstantly?: boolean },
) {
  const explicit = properties
    ? Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined))
    : undefined;
  ph()?.capture(
    event,
    { ...attributionProps(), ...explicit },
    options?.sendInstantly ? { send_instantly: true } : undefined,
  );
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
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_LEAD;
  whenReady(
    () => typeof window.gtag === 'function',
    () => {
      window.gtag('event', 'generate_lead', input?.service ? { service: input.service } : {});
      if (adsId && label) {
        window.gtag('event', 'conversion', {
          send_to: `${adsId}/${label}`,
        });
      }
    },
  );
}

/**
 * LinkedIn conversion. No-op until the matching conversion ID env var is set.
 * Retries briefly so the call lands after the Insight Tag stub is installed.
 */
export function trackLinkedInConversion(kind: 'purchase' | 'lead') {
  const raw =
    kind === 'purchase'
      ? process.env.NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_PURCHASE
      : process.env.NEXT_PUBLIC_LINKEDIN_CONVERSION_ID_LEAD;
  const id = Number(raw);
  if (!raw || !Number.isFinite(id) || id <= 0) return;
  whenReady(
    () => typeof window.lintrk === 'function',
    () => {
      window.lintrk?.('track', { conversion_id: id });
    },
  );
}

/** OpenAI Ads `lead_created` on the business-services thank-you page. */
export function trackOpenAiLead() {
  whenReady(
    () => typeof window.oaiq === 'function',
    () => {
      window.oaiq?.('measure', 'lead_created', { type: 'customer_action' });
    },
    10000,
  );
}

/** SPA page view after the pixel's init call, which already measures the first view. */
export function trackOpenAiPageView(path: string) {
  const id = path.slice(0, 128) || 'page';
  whenReady(
    () => typeof window.oaiq === 'function',
    () => {
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
