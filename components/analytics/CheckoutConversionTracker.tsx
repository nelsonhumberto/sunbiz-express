'use client';

import { useEffect, useRef } from 'react';
import {
  checkoutFunnelEventProperties,
  checkoutPaidAlreadySent,
  checkoutSuccessAlreadyViewed,
  identifyUser,
  markCheckoutPaidSent,
  markCheckoutSuccessViewed,
  markPurchaseCompletedSent,
  purchaseCompletedAlreadySent,
  purchaseCompletedEventProperties,
  trackEvent,
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
  locale?: string | null;
  isTest?: boolean | null;
  isTester?: boolean | null;
  email?: string | null;
  utm?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    gclid?: string | null;
  };
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
  locale,
  isTest,
  isTester,
  email,
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
          }
        : null,
    );

    identifyUser(userId, utmProps);
    const successKey = filingId ?? '';
    if (!successKey || !checkoutSuccessAlreadyViewed(successKey)) {
      if (successKey) markCheckoutSuccessViewed(successKey);
      trackEvent(
        'checkout_success_viewed',
        checkoutFunnelEventProperties({
          filingId,
          plan: tier,
          amountCents,
          locale,
          isTest,
        }),
      );
    }
    const paidProps = {
      ...purchaseCompletedEventProperties({
        filingId,
        amountCents,
        currency,
        state,
        entityType,
        tier,
      }),
      ...utmProps,
    };
    if (filingId && !checkoutPaidAlreadySent(filingId)) {
      trackEvent('checkout_paid', paidProps);
      markCheckoutPaidSent(filingId);
    }
    if (filingId && !purchaseCompletedAlreadySent(filingId)) {
      trackPurchaseCompleted(paidProps);
      markPurchaseCompletedSent(filingId);
    }

    // GA4 + Google Ads conversion (no-op when gtag/env not configured).
    if (filingId && typeof amountCents === 'number') {
      trackGooglePurchase({
        transactionId: filingId,
        valueCents: amountCents,
        ...(currency ? { currency } : {}),
        isTest,
        isTester,
        email,
      });
    }
  }, [userId, filingId, amountCents, currency, state, entityType, tier, locale, isTest, isTester, email, utm]);

  return null;
}
