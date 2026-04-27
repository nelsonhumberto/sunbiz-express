'use client';

import { useTransition } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { archiveDraft } from '@/actions/dashboard';
import { cn } from '@/lib/utils';

interface Props {
  filingId: string;
  className?: string;
  /** When true, renders an icon-only button (used inside compact card rows). */
  iconOnly?: boolean;
}

export function ArchiveDraftButton({ filingId, className, iconOnly }: Props) {
  const t = useTranslations('dashboard');
  const [pending, start] = useTransition();

  const onClick = () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(t('archiveConfirm'));
      if (!ok) return;
    }
    start(async () => {
      const res = await archiveDraft({ filingId });
      if (!res.ok) {
        toast.error(res.error ?? t('archiveError'));
        return;
      }
      toast.success(t('archiveSuccess'));
    });
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={t('archiveDraft')}
        title={t('archiveDraft')}
        className={cn(
          'inline-flex items-center justify-center h-8 w-8 rounded-md text-ink-subtle hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50 disabled:pointer-events-none',
          className,
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium text-ink-subtle hover:text-destructive transition-colors disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      {t('archiveDraft')}
    </button>
  );
}
