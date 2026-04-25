'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { advanceFilingStatus } from '@/actions/admin';

export function AdvanceStatusButton({
  filingId,
  status,
}: {
  filingId: string;
  status: string;
}) {
  const [pending, start] = useTransition();
  const label =
    status === 'DRAFT' ? 'Force submit' : status === 'SUBMITTED' ? 'Approve' : 'Advance';
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await advanceFilingStatus(filingId);
            toast.success(`Filing ${status === 'SUBMITTED' ? 'approved' : 'advanced'}.`);
          } catch (e) {
            toast.error((e as Error).message);
          }
        });
      }}
    >
      {pending ? '…' : label}
    </Button>
  );
}
