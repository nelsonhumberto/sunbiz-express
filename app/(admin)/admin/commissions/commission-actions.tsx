'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { approveCommission, markCommissionPaid, reverseCommission } from '@/actions/admin-partners';
import type { CommissionStatus } from '@/lib/affiliate';

export function CommissionActions({
  filingId,
  status,
  payoutRef,
}: {
  filingId: string;
  status: CommissionStatus;
  payoutRef: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? 'Could not update this commission.');
    });
  }

  if (status === 'REVERSED') {
    return <span className="text-xs text-ink-muted">Reversed</span>;
  }

  return (
    <div className="space-y-2 min-w-[220px]">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'PENDING' ? (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => approveCommission(filingId))}>
            Approve
          </Button>
        ) : null}
        {status === 'APPROVED' ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() => markCommissionPaid(filingId, data));
            }}
          >
            <Input name="payoutRef" required placeholder="PayPal batch id" className="h-8 w-36 text-xs" />
            <Button size="sm" type="submit" disabled={isPending}>
              Mark paid
            </Button>
          </form>
        ) : null}
        {status === 'PAID' ? (
          <span className="text-xs text-ink-muted">Paid: {payoutRef}</span>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => run(() => reverseCommission(filingId))}
        >
          Reverse
        </Button>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin text-ink-muted" /> : null}
      </div>
      {error ? (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      ) : null}
    </div>
  );
}
