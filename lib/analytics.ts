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

export function trackStateSwitched(from: string, to: string, surface: string) {
  trackEvent('state_switched', { from_state: from, to_state: to, surface });
}
