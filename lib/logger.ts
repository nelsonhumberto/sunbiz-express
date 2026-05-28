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
