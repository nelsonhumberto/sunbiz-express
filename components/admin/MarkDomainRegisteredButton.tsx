'use client';

import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toggleDomainRegistered } from '@/actions/admin';

export function MarkDomainRegisteredButton({
  filingId,
  registered,
}: {
  filingId: string;
  registered: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant={registered ? 'outline' : 'secondary'}
      disabled={pending}
      title={
        registered
          ? 'Clear the mark if the .com still needs to be registered'
          : 'Mark this after you register the .com by hand'
      }
      onClick={() => {
        start(async () => {
          try {
            const res = await toggleDomainRegistered(filingId);
            toast.success(res.registered ? 'Marked domain registered' : 'Domain mark cleared');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update the domain mark');
          }
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {registered ? 'Marked registered' : 'Mark domain registered'}
    </Button>
  );
}
