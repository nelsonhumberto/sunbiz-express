'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackEvent, trackGoogleLead, trackOpenAiLead } from '@/lib/analytics';
import { isServiceInquiryOption } from '@/lib/service-inquiry';
import { utmToAnalyticsProps } from '@/lib/utm';
import { getClientUtmAttribution } from '@/lib/utm-client';

/**
 * Fires once on /business-services/thank-you. `/es/business-services/thank-you`
 * rewrites to this same page, so the English and Spanish URLs both send
 * `generate_lead` and the OpenAI Ads `lead_created` event.
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
    trackOpenAiLead();

    // Drop the one-time flag so a refresh does not send the lead events again.
    const url = new URL(window.location.href);
    url.searchParams.delete('lead');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [fromSubmit, service]);

  return null;
}
