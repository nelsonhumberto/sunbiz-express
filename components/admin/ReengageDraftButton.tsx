'use client';

import { useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendDraftReengagementEmail } from '@/actions/admin';

export function ReengageDraftButton({
  filingId,
  customerEmail,
  businessName,
}: {
  filingId: string;
  customerEmail: string;
  businessName: string | null;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const label = businessName?.trim() || 'this draft';
        if (!window.confirm(`Send a re-engagement email to ${customerEmail} for ${label}?`)) return;
        start(async () => {
          try {
            const res = await sendDraftReengagementEmail(filingId);
            if (res.ok) toast.success(res.message);
            else toast.error(res.message);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not send the email');
          }
        });
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      Re-engage
    </Button>
  );
}
