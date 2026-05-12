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

export function trackAddOnToggled(slug: string, action: 'added' | 'removed', tier: string, state: string) {
  trackEvent('add_on_toggled', { slug, action, tier, state });
}

export function trackStateSwitched(from: string, to: string, surface: string) {
  trackEvent('state_switched', { from_state: from, to_state: to, surface });
}
