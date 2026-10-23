import crypto from 'crypto';

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

function secretKey(secret: string): Buffer {
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
  return Buffer.from(encoded, 'base64');
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Verify a Resend (Svix) webhook signature.
 *
 * Signed content is `${id}.${timestamp}.${rawBody}`. The secret is the
 * `whsec_…` value from the Resend dashboard (`RESEND_WEBHOOK_SECRET`).
 */
export function verifySvixSignature(args: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const { payload, id, timestamp, signature, secret } = args;
  if (!id || !timestamp || !signature || !secret.trim()) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = args.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return false;

  let key: Buffer;
  try {
    key = secretKey(secret);
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');

  const candidates = signature.split(' ').filter(Boolean);
  for (const candidate of candidates) {
    const [version, value] = candidate.split(',', 2);
    if (version !== 'v1' || !value) continue;
    if (timingSafeEqualString(value, expected)) return true;
  }
  return false;
}
