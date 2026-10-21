'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  trackEvent,
  trackGoogleLead,
  trackLinkedInConversion,
  trackOpenAiLead,
} from '@/lib/analytics';
import { isServiceInquiryOption } from '@/lib/service-inquiry';
import { utmToAnalyticsProps } from '@/lib/utm';
import { getClientUtmAttribution } from '@/lib/utm-client';

/**
 * Fires once on /business-services/thank-you (and the Spanish URL).
 * LinkedIn also counts this URL as a lead via the Insight Tag page view.
 */
export function LeadConversionTracker() {
  const fired = useRef(false);
  const searchParams = useSearchParams();
  const rawService = searchParams.get('service') ?? '';
  const service = isServiceInquiryOption(rawService) ? rawService : undefined;
  const fromSubmit = searchParams.get('lead') === '1';

  useEffect(() => {
    if (!fromSubmit || fired.current) return;
    fired.current = true;

    const utmProps = utmToAnalyticsProps(getClientUtmAttribution());
    trackEvent('generate_lead', { service, ...utmProps });
    trackGoogleLead({ service });
    trackLinkedInConversion('lead');
    trackOpenAiLead();

    // Drop the one-time flag so a refresh does not send the lead events again.
    // The path stays /business-services/thank-you, which is what LinkedIn counts.
    const url = new URL(window.location.href);
    url.searchParams.delete('lead');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [fromSubmit, service]);

  return null;
}
