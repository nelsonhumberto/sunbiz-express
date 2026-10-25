'use client';

import { useEffect, useRef } from 'react';
import {
  identifyUser,
  purchaseCompletedEventProperties,
  trackPurchaseCompleted,
  trackGooglePurchase,
} from '@/lib/analytics';
import { utmToAnalyticsProps } from '@/lib/utm';

interface CheckoutConversionTrackerProps {
  userId: string;
  filingId?: string | null;
  /** Verified Checkout Session amount_total, in minor units. */
  amountCents?: number | null;
  /** Verified Checkout Session currency, uppercase ISO code. */
  currency?: string | null;
  state?: string | null;
  entityType?: string | null;
  tier?: string | null;
  utm?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    gclid?: string | null;
  };
  /** Launch bundle orders must not send a Google Ads conversion. PostHog still fires. */
  suppressGoogleAds?: boolean;
}

/**
 * Fire once after the server has verified a paid Checkout Session.
 * The PostHog event is `purchase_completed` via trackPurchaseCompleted.
 * Do not mount this component for a missing, invalid, or unpaid session.
 */
export function CheckoutConversionTracker({
  userId,
  filingId,
  amountCents,
  currency,
  state,
  entityType,
  tier,
  utm,
  suppressGoogleAds = false,
}: CheckoutConversionTrackerProps) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const utmProps = utmToAnalyticsProps(
      utm
        ? {
            utm_source: utm.utmSource ?? undefined,
            utm_medium: utm.utmMedium ?? undefined,
            utm_campaign: utm.utmCampaign ?? undefined,
            utm_content: utm.utmContent ?? undefined,
            utm_term: utm.utmTerm ?? undefined,
            gclid: utm.gclid ?? undefined,
          }
        : null,
    );

    identifyUser(userId, utmProps);
    trackPurchaseCompleted({
      ...purchaseCompletedEventProperties({
        filingId,
        amountCents,
        currency,
        state,
        entityType,
        tier,
      }),
      ...utmProps,
    });

    // GA4 + Google Ads conversion (no-op when gtag/env not configured).
    // Skipped for the launch bundle so an EIN-inclusive order is not an Ads conversion.
    if (!suppressGoogleAds && filingId && typeof amountCents === 'number') {
      trackGooglePurchase({
        transactionId: filingId,
        valueCents: amountCents,
        ...(currency ? { currency } : {}),
      });
    }
  }, [userId, filingId, amountCents, currency, state, entityType, tier, utm, suppressGoogleAds]);

  return null;
}
