'use client';

import { useTransition } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { resendEmailNotification } from '@/actions/admin';

export function ResendEmailButton({ notificationId }: { notificationId: string }) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            const res = await resendEmailNotification(notificationId);
            if (res.status === 'SENT') {
              toast.success('Email resent successfully');
            } else {
              toast.error(res.errorMessage ?? 'Delivery failed — check SMTP credentials');
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not resend');
          }
        });
      }}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      Resend
    </Button>
  );
}
