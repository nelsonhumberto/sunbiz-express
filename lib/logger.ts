/**
 * Lightweight structured logger for client + server. Console for now,
 * with a pluggable sink so we can route to Sentry / Datadog later
 * without touching every caller.
 *
 * The May 2026 audit flagged that the wizard silently swallowed errors
 * via a React error boundary (empty-string console exceptions). Routing
 * everything through this logger gives us a single seam to add upstream
 * monitoring later.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Logical area — `wizard`, `checkout`, `dashboard`, etc. */
  area?: string;
  /** Identifier for the entity the event is about (filing id, payment id). */
  entityId?: string;
  /** Caller-supplied tag for analytics. */
  tag?: string;
  /** Arbitrary structured fields. */
  [key: string]: unknown;
}

interface CapturedError {
  message: string;
  stack?: string;
  level: LogLevel;
  context: LogContext;
  timestamp: string;
}

let externalSink: ((event: CapturedError) => void) | null = null;

/**
 * Register an external sink (e.g. Sentry, Datadog Browser RUM). Called
 * once at app boot — usually from `app/layout.tsx` once the environment
 * variables are present.
 */
export function setExternalSink(sink: (event: CapturedError) => void) {
  externalSink = sink;
}

function dispatch(level: LogLevel, message: string, ctx: LogContext, err?: unknown) {
  const event: CapturedError = {
    message,
    level,
    context: ctx,
    timestamp: new Date().toISOString(),
    stack: err instanceof Error ? err.stack : undefined,
  };

  // Local console output. Keep a stable prefix so log scrapers can
  // filter LaunchForma noise from the surrounding Next.js/Vercel logs.
  const prefix = `[lf:${ctx.area ?? 'app'}]`;
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(prefix, message, ctx, err ?? '');
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(prefix, message, ctx);
  } else {
    // eslint-disable-next-line no-console
    console.log(prefix, message, ctx);
  }

  if (externalSink) {
    try {
      externalSink(event);
    } catch {
      // Never let the logger itself blow up the caller.
    }
  }
}

export const logger = {
  debug: (message: string, ctx: LogContext = {}) => dispatch('debug', message, ctx),
  info: (message: string, ctx: LogContext = {}) => dispatch('info', message, ctx),
  warn: (message: string, ctx: LogContext = {}) => dispatch('warn', message, ctx),
  error: (message: string, ctx: LogContext = {}, err?: unknown) =>
    dispatch('error', message, ctx, err),
};

// Auto-wire an external sink on the server when LOG_WEBHOOK_URL is configured,
// so warn/error events leave the console and reach an actual alerting channel
// (Slack-compatible incoming webhook payload). Fire-and-forget; never blocks.
if (typeof window === 'undefined' && process.env.LOG_WEBHOOK_URL && !externalSink) {
  const url = process.env.LOG_WEBHOOK_URL;
  setExternalSink((event) => {
    if (event.level !== 'error' && event.level !== 'warn') return;
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `[${event.level}] ${event.context.area ?? 'app'}: ${event.message}`,
        level: event.level,
        context: event.context,
        stack: event.stack,
        timestamp: event.timestamp,
      }),
    }).catch(() => {
      /* never let alerting break the request */
    });
  });
}
