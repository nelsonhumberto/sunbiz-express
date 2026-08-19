import 'server-only';

import { headers } from 'next/headers';

/**
 * Lightweight fixed-window rate limiter.
 *
 * Best-effort, in-memory (per serverless instance). It is NOT a distributed
 * limiter - under heavy horizontal scale a determined attacker could get a few
 * extra attempts per instance - but it raises the cost of credential stuffing,
 * coupon brute-force, name-check scraping, and email bombing from "free" to
 * "annoying", with zero infra. Swap the store for Upstash/Redis later if
 * stricter guarantees are needed (the public API stays the same).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded on a long-lived lambda.
function sweep(now: number) {
  if (store.size < 5000) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Consume one token from the `key` bucket. Allows `limit` requests per
 * `windowMs`. Returns `ok: false` once the window is exhausted.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return h.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Convenience guard for server actions: rate-limit by IP under a named scope.
 * Returns an error string when the caller is over the limit, else null.
 */
export function checkActionRateLimit(
  scope: string,
  limit: number,
  windowMs: number,
  extraKey?: string,
): string | null {
  const ip = clientIp();
  const key = `${scope}:${ip}${extraKey ? `:${extraKey}` : ''}`;
  const res = rateLimit(key, limit, windowMs);
  if (!res.ok) {
    return `Too many attempts. Please wait ${res.retryAfterSeconds}s and try again.`;
  }
  return null;
}
