'use client';

import { useEffect } from 'react';
import { useErrorLocale } from '@/components/i18n/useErrorLocale';
import { ERROR_PAGE_COPY } from '@/lib/error-page-copy';
import { logger } from '@/lib/logger';

/**
 * Last-resort error boundary that Next.js renders if the root layout
 * itself throws. Copy follows the public URL because this boundary
 * replaces the layout and has no next-intl provider.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useErrorLocale();
  const copy = ERROR_PAGE_COPY[locale];

  useEffect(() => {
    logger.error('Unhandled root error', {
      area: 'app',
      digest: error.digest,
      tag: 'global-error-boundary',
    }, error);
  }, [error]);

  return (
    <html lang={locale}>
      <body>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            padding: '2rem',
            background: '#f8f7f4',
            color: '#1a1a1a',
          }}
        >
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 12 }}>
              {copy.globalTitle}
            </h1>
            <p style={{ color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
              {copy.globalBody}{' '}
              <a href="mailto:help@launchforma.com" style={{ color: '#1d4ed8' }}>
                help@launchforma.com
              </a>
            </p>
            {error.digest && (
              <p
                style={{
                  color: '#999',
                  fontSize: 12,
                  marginBottom: 24,
                  fontFamily: 'monospace',
                }}
              >
                {copy.ref}: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: '#1d4ed8',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copy.tryAgain}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
