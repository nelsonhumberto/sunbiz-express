'use client';

import { useEffect } from 'react';
import { useErrorLocale } from '@/components/i18n/useErrorLocale';
import { ERROR_PAGE_COPY } from '@/lib/error-page-copy';
import { logger } from '@/lib/logger';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useErrorLocale();
  const copy = ERROR_PAGE_COPY[locale];

  useEffect(() => {
    logger.error('Unhandled route error', {
      area: 'app',
      digest: error.digest,
      tag: 'error-boundary',
    }, error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface px-6 py-12">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="font-display text-2xl font-medium">{copy.globalTitle}</h1>
        <p className="text-sm text-ink-muted leading-relaxed">
          {copy.globalBody}{' '}
          <a className="text-primary underline" href="mailto:help@launchforma.com">
            help@launchforma.com
          </a>
        </p>
        {error.digest ? (
          <p className="text-[11px] font-mono text-ink-subtle">
            {copy.ref}: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          {copy.tryAgain}
        </button>
      </div>
    </main>
  );
}
