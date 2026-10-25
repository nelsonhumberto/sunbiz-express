'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useErrorLocale } from '@/components/i18n/useErrorLocale';
import { hrefForLocale } from '@/lib/app-href';
import { Button } from '@/components/ui/button';
import { ERROR_PAGE_COPY } from '@/lib/error-page-copy';
import { logger } from '@/lib/logger';

/**
 * Wizard-scoped error boundary. The public URL decides the language
 * because a rewritten /es path does not always show up in usePathname.
 */
export default function WizardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useErrorLocale();
  const copy = ERROR_PAGE_COPY[locale];

  useEffect(() => {
    logger.error('Wizard render failure', {
      area: 'wizard',
      digest: error.digest,
      tag: 'wizard-error-boundary',
    }, error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-6 py-12">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="mx-auto h-12 w-12 rounded-full bg-warn-subtle text-warn flex items-center justify-center">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-medium">{copy.wizardTitle}</h1>
          <p className="text-sm text-ink-muted leading-relaxed">{copy.wizardBody}</p>
        </div>
        {error.digest && (
          <p className="text-[11px] font-mono text-ink-subtle">
            {copy.ref}: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button type="button" onClick={() => reset()}>
            <RefreshCw className="h-4 w-4" /> {copy.tryAgain}
          </Button>
          <Button asChild variant="outline">
            <Link href={hrefForLocale('/dashboard', locale)}>{copy.dashboard}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
