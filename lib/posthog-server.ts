import { logger } from '@/lib/logger';
import { sanitizeDistinctId } from '@/lib/posthog-distinct-id';
import { CHECKOUT_UTM_KEYS } from '@/lib/checkout-attribution';
import { isInternalTrafficUser } from '@/lib/internal-traffic';

/** Server captures run in production only. Preview and local dev send nothing. */
export function posthogServerCaptureEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.VERCEL_ENV === 'production' && Boolean(env.NEXT_PUBLIC_POSTHOG_KEY);
}

/** `$host` plus the Vercel environment, on every server event. */
export function posthogServerEventProperties(
  env: NodeJS.ProcessEnv = process.env,
): { $host: string; environment: string } {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://launchforma.com';
  let host = 'launchforma.com';
  try {
    host = new URL(raw).host || host;
  } catch {
    host = 'launchforma.com';
  }
  return {
    $host: host,
    environment: env.VERCEL_ENV?.trim() || 'development',
  };
}

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
  /** Filing this purchase belongs to. One filing is one server purchase. */
  context: { filing_id: string };
  properties: Record<string, string | number | boolean>;
}

/**
 * Payload for one paid filing. `$insert_id` is the filing id, so a second
 * delivery of the same PaymentIntent does not become a second purchase.
 * The visitor id stays `distinct_id` when Stripe stored one.
 */
export function buildPurchaseCompletedCapture(
  pi: PurchaseIntentLike,
  nowMs = Date.now(),
  options?: { internal?: boolean },
): PurchaseCaptureBody | null {
  if (!pi.id) return null;
  const metadata = pi.metadata ?? {};
  const filingId = (metadata.filingId || pi.id).slice(0, 200);
  const distinctId =
    sanitizeDistinctId(metadata.posthog_distinct_id) ||
    sanitizeDistinctId(metadata.userId) ||
    filingId;
  const amountCents = pi.amount_received || pi.amount || 0;
  const properties: Record<string, string | number | boolean> = {
    order_id: filingId,
    filing_id: filingId,
    payment_intent_id: pi.id,
    amount: Math.round(amountCents) / 100,
    currency: (pi.currency || 'usd').toUpperCase(),
    $insert_id: filingId,
    ...posthogServerEventProperties(),
  };
  if (options?.internal) properties.is_internal = true;
  for (const key of CHECKOUT_UTM_KEYS) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) properties[key] = value.trim();
  }
  const createdSec = pi.created && pi.created > 0 ? pi.created : Math.floor(nowMs / 1000);
  return {
    event: 'purchase_completed_server',
    distinct_id: distinctId,
    timestamp: new Date(createdSec * 1000).toISOString(),
    context: { filing_id: filingId },
    properties,
  };
}

/** Capture only when this request inserted the paid Payment row. */
export function shouldCapturePaidTransition(paymentInserted: boolean): boolean {
  return paymentInserted;
}

export interface ResumeEmailSentCapture {
  event: 'resume_email_sent';
  distinct_id: string;
  properties: {
    step: string;
    filingId: string;
    locale: string;
    $host: string;
    environment: string;
    is_internal?: boolean;
  };
}

/** Payload for one resume-order send. Empty ids are skipped. */
export function buildResumeEmailSentCapture(input: {
  step: string;
  filingId: string;
  locale: string;
  user?: { role?: string | null; email?: string | null } | null;
}): ResumeEmailSentCapture | null {
  const step = input.step.trim();
  const filingId = input.filingId.trim();
  const locale = input.locale.trim();
  if (!step || !filingId || !locale) return null;
  const properties: ResumeEmailSentCapture['properties'] = {
    step,
    filingId,
    locale,
    ...posthogServerEventProperties(),
  };
  if (isInternalTrafficUser(input.user)) properties.is_internal = true;
  return {
    event: 'resume_email_sent',
    distinct_id: filingId,
    properties,
  };
}

/**
 * Server capture for a resume email that actually went out.
 * No-ops when PostHog is not configured, and never throws.
 */
export async function captureResumeEmailSent(input: {
  step: string;
  filingId: string;
  locale: string;
  user?: { role?: string | null; email?: string | null } | null;
}): Promise<void> {
  try {
    if (!posthogServerCaptureEnabled()) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const body = buildResumeEmailSentCapture(input);
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
        logger.warn('posthog resume email capture failed', {
          area: 'analytics',
          tag: 'resume_email_sent',
          status: res.status,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    logger.warn('posthog resume email capture skipped', {
      area: 'analytics',
      tag: 'resume_email_sent',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Server-side purchase capture. Never throws. A PostHog outage must not
 * fail the Stripe webhook. Awaited with a short timeout so the request
 * finishes the POST before the serverless isolate freezes.
 */
export async function capturePurchaseCompletedServer(
  pi: PurchaseIntentLike,
  options?: { internal?: boolean },
): Promise<void> {
  try {
    if (!posthogServerCaptureEnabled()) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    const body = buildPurchaseCompletedCapture(pi, Date.now(), options);
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
