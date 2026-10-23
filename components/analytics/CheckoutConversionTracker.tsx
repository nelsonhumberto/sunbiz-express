'use client';

import { useEffect, useRef } from 'react';
import { identifyUser, trackPurchaseCompleted, trackGooglePurchase, trackLinkedInConversion } from '@/lib/analytics';
import { utmToAnalyticsProps } from '@/lib/utm';

interface CheckoutConversionTrackerProps {
  userId: string;
  filingId: string;
  totalCents: number;
  state: string;
  entityType: string;
  tier: string;
  utm?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    gclid?: string | null;
    liFatId?: string | null;
  };
}

/** Fire once on checkout success so PostHog can attribute revenue to campaigns. */
export function CheckoutConversionTracker({
  userId,
  filingId,
  totalCents,
  state,
  entityType,
  tier,
  utm,
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
            li_fat_id: utm.liFatId ?? undefined,
          }
        : null,
    );

    identifyUser(userId, utmProps);
    trackPurchaseCompleted({
      filing_id: filingId,
      order_id: filingId,
      revenue_cents: totalCents,
      value: totalCents / 100,
      currency: 'USD',
      state,
      entity_type: entityType,
      tier,
      ...utmProps,
    });

    // GA4 + Google Ads conversion (no-op when gtag/env not configured).
    trackGooglePurchase({ transactionId: filingId, valueCents: totalCents });
    // LinkedIn purchase conversion (no-op until the conversion ID is set).
    trackLinkedInConversion('purchase');
  }, [userId, filingId, totalCents, state, entityType, tier, utm]);

  return null;
}
