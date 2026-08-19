'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

/**
 * Wizard-scoped error boundary. Previously the wizard caught its own
 * exceptions silently, which the May 2026 audit identified as the
 * source of the empty-string console errors accumulating during a
 * single session. This boundary now logs every failure with `logger`
 * (so it lands in our central log sink) and surfaces a recoverable UI
 * instead of leaving the visitor on a half-rendered page.
 */
export default function WizardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          <h1 className="font-display text-2xl font-medium">
            Something stalled in the filing wizard.
          </h1>
          <p className="text-sm text-ink-muted leading-relaxed">
            We logged the error and the LaunchForma team will pick it up.
            Your draft is saved - try again, or head back to your
            dashboard to resume from the last completed step.
          </p>
        </div>
        {error.digest && (
          <p className="text-[11px] font-mono text-ink-subtle">
            Error ref: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button type="button" onClick={() => reset()}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
