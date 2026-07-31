'use client';

import { useTransition } from 'react';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toggleAdminArchiveFiling } from '@/actions/admin';

export function ArchiveFilingButton({
  filingId,
  archived,
  compact = false,
}: {
  filingId: string;
  archived: boolean;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant={archived ? 'outline' : 'ghost'}
      disabled={pending}
      title={
        archived
          ? 'Restore — counts in analytics again'
          : 'Archive — hide from analytics (test/auditor)'
      }
      className={
        archived
          ? 'text-ink-muted border-dashed'
          : 'text-ink-subtle hover:text-ink'
      }
      onClick={() => {
        start(async () => {
          try {
            const res = await toggleAdminArchiveFiling(filingId);
            toast.success(
              res.archived
                ? 'Archived — excluded from analytics'
                : 'Restored — counts in analytics again',
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update filing');
          }
        });
      }}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : archived ? (
        <ArchiveRestore className="h-3.5 w-3.5" />
      ) : (
        <Archive className="h-3.5 w-3.5" />
      )}
      {!compact && (archived ? 'Restore' : 'Archive')}
    </Button>
  );
}
