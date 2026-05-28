'use client';

import { useEffect, useRef } from 'react';
import { identifyUser, trackPurchaseCompleted } from '@/lib/analytics';
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
          }
        : null,
    );

    identifyUser(userId, utmProps);
    trackPurchaseCompleted({
      filing_id: filingId,
      revenue_cents: totalCents,
      state,
      entity_type: entityType,
      tier,
      ...utmProps,
    });
  }, [userId, filingId, totalCents, state, entityType, tier, utm]);

  return null;
}
