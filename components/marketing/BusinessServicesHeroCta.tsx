'use client';

import { Button } from '@/components/ui/button';
import { trackCtaClicked } from '@/lib/analytics';

/**
 * Above-the-fold action on /business-services. One primary control jumps to
 * the inquiry form. Tap-to-call renders only when a real phone number is set.
 */
export function BusinessServicesHeroCta({
  primaryLabel,
  callLabel,
  phone,
}: {
  primaryLabel: string;
  callLabel: string;
  phone: string;
}) {
  const trimmed = phone.trim();
  const phoneHref = trimmed.replace(/[^\d+]/g, '');

  return (
    <div className="mt-6 flex w-full max-w-md mx-auto flex-col gap-3 sm:max-w-lg">
      <Button asChild size="xl" className="text-base shadow-xl w-full">
        <a
          href="#request"
          onClick={() =>
            trackCtaClicked('business_services_inquiry', { page: 'business_services' })
          }
        >
          {primaryLabel}
        </a>
      </Button>
      {trimmed && phoneHref ? (
        <Button asChild size="xl" variant="outline" className="text-base w-full">
          <a
            href={`tel:${phoneHref}`}
            onClick={() =>
              trackCtaClicked('business_services_call', { page: 'business_services' })
            }
          >
            {callLabel}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
