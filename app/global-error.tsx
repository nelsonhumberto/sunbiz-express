'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

/**
 * Last-resort error boundary that Next.js renders if the root layout
 * itself throws. We log the error to our central logger (which today
 * goes to `console.error` with a stable prefix - easy to grep in
 * Vercel logs and easy to forward to Sentry later) and show a clean
 * recovery UI instead of the default blank page.
 *
 * The May 2026 audit flagged that the wizard was silently catching
 * empty-string exceptions via a React boundary. Routing them through
 * `logger.error` ensures we no longer lose signal.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Unhandled root error', {
      area: 'app',
      digest: error.digest,
      tag: 'global-error-boundary',
    }, error);
  }, [error]);

  return (
    <html lang="en">
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
              Something went wrong.
            </h1>
            <p style={{ color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
              We&apos;ve been notified and are looking into it. You can try
              again, or email{' '}
              <a href="mailto:help@launchforma.com" style={{ color: '#1d4ed8' }}>
                help@launchforma.com
              </a>{' '}
              if it persists.
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
                Error ref: {error.digest}
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
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
