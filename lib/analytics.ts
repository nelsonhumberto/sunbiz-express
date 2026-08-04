/**
 * Lightweight analytics helpers wrapping PostHog (client-side) and providing
 * a unified event taxonomy. When NEXT_PUBLIC_POSTHOG_KEY is not set, all
 * calls are safe no-ops so the app never breaks without analytics configured.
 */

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

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  ph()?.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  ph()?.identify(userId, traits);
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

export function trackAddOnToggled(slug: string, action: 'added' | 'removed', tier: string, state: string) {
  trackEvent('add_on_toggled', { slug, action, tier, state });
}

export function trackStateSwitched(from: string, to: string, surface: string) {
  trackEvent('state_switched', { from_state: from, to_state: to, surface });
}
