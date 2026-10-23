import type { UtmData } from '@/lib/utm';
import { sanitizeDistinctId } from '@/lib/posthog-distinct-id';

export const CHECKOUT_UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export type CheckoutUtmKey = (typeof CHECKOUT_UTM_KEYS)[number];

/** Filing columns that mirror the five checkout UTMs. */
export interface FilingUtmFields {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

const FILING_FIELD: Record<CheckoutUtmKey, keyof FilingUtmFields> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
};

const STRIPE_VALUE_MAX = 500;

/**
 * Stripe PaymentIntent metadata for ad attribution. Cookie values win over
 * the filing's stored last-touch UTMs. Only non-empty strings are included.
 * `posthog_distinct_id` is the visitor id captured in the browser.
 */
export function checkoutAttributionMetadata(input: {
  cookie?: UtmData | null;
  filing?: FilingUtmFields | null;
  posthogDistinctId?: string | null;
}): Record<string, string> {
  const meta: Record<string, string> = {};
  const cookie = input.cookie ?? null;
  const filing = input.filing ?? null;

  for (const key of CHECKOUT_UTM_KEYS) {
    const fromCookie = cookie?.[key];
    const fromFiling = filing?.[FILING_FIELD[key]] ?? undefined;
    const value = (fromCookie || fromFiling || '').trim();
    if (value) meta[key] = value.slice(0, STRIPE_VALUE_MAX);
  }

  const distinctId = sanitizeDistinctId(input.posthogDistinctId);
  if (distinctId) meta.posthog_distinct_id = distinctId;
  return meta;
}
