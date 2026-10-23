import { logger } from '@/lib/logger';
import { sanitizeDistinctId } from '@/lib/posthog-distinct-id';
import { CHECKOUT_UTM_KEYS } from '@/lib/checkout-attribution';

const CAPTURE_TIMEOUT_MS = 2000;

export interface PurchaseIntentLike {
  id: string;
  amount?: number | null;
  amount_received?: number | null;
  currency?: string | null;
  created?: number | null;
  metadata?: Record<string, string> | null;
}

export interface PurchaseCaptureBody {
  event: 'purchase_completed_server';
  distinct_id: string;
  timestamp: string;
  properties: Record<string, string | number>;
}

/**
 * PostHog capture payload for a succeeded PaymentIntent. `$insert_id` is the
 * PaymentIntent id so Stripe redeliveries dedupe.
 */
export function buildPurchaseCompletedCapture(
  pi: PurchaseIntentLike,
  nowMs = Date.now(),
): PurchaseCaptureBody | null {
  if (!pi.id) return null;
  const metadata = pi.metadata ?? {};
  const distinctId =
    sanitizeDistinctId(metadata.posthog_distinct_id) ||
    sanitizeDistinctId(metadata.userId) ||
    pi.id;
  const amountCents = pi.amount_received || pi.amount || 0;
  const properties: Record<string, string | number> = {
    order_id: (metadata.filingId || pi.id).slice(0, 200),
    amount: Math.round(amountCents) / 100,
    currency: (pi.currency || 'usd').toUpperCase(),
    $insert_id: pi.id,
  };
  for (const key of CHECKOUT_UTM_KEYS) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) properties[key] = value.trim();
  }
  const createdSec = pi.created && pi.created > 0 ? pi.created : Math.floor(nowMs / 1000);
  return {
    event: 'purchase_completed_server',
    distinct_id: distinctId,
    timestamp: new Date(createdSec * 1000).toISOString(),
    properties,
  };
}

/**
 * Server-side purchase capture. Never throws — a PostHog outage must not
 * fail the Stripe webhook. Awaited with a short timeout so the request
 * finishes the POST before the serverless isolate freezes.
 */
export async function capturePurchaseCompletedServer(pi: PurchaseIntentLike): Promise<void> {
  try {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const body = buildPurchaseCompletedCapture(pi);
    if (!body) return;
    const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
    try {
      const res = await fetch(`${host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, ...body }),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn('posthog purchase capture failed', {
          area: 'analytics',
          tag: 'purchase_completed_server',
          status: res.status,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn('posthog purchase capture skipped', {
      area: 'analytics',
      tag: 'purchase_completed_server',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
