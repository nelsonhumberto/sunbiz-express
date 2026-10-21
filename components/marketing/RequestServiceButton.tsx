'use client';

import { Button } from '@/components/ui/button';
import type { ServiceInquiryOption } from '@/lib/service-inquiry';

/** Scrolls to the inquiry form and preselects a service. */
export function RequestServiceButton({
  service,
  label,
  variant = 'default',
  className,
}: {
  service: ServiceInquiryOption;
  label: string;
  variant?: 'default' | 'outline';
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => {
        window.dispatchEvent(new CustomEvent('lf-inquiry-service', { detail: service }));
        document.getElementById('request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    >
      {label}
    </Button>
  );
}
