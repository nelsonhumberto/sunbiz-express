import { createHmac, timingSafeEqual } from 'node:crypto';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';

const PURPOSE = 'lf-unsub-v1';

/** New links last one year from the moment they are signed. */
export const UNSUBSCRIBE_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Links signed before expiry was added have no timestamp. They keep working
 * until this instant, about a year after the change, and then stop.
 */
export const UNSUBSCRIBE_LEGACY_UNTIL_MS = Date.parse('2027-10-25T00:00:00.000Z');

const DEV_UNSUBSCRIBE_SECRET = 'launchforma-dev-unsubscribe';

export function unsubscribeSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.UNSUBSCRIBE_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (secret) return secret;
  if (env.NODE_ENV === 'production') {
    throw new Error('UNSUBSCRIBE_SECRET or NEXTAUTH_SECRET is required in production.');
  }
  return DEV_UNSUBSCRIBE_SECRET;
}

function signPayload(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

function signaturesMatch(sig: string, expected: string): boolean {
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Signed token for one mailbox. Expires one year after `now`. */
export function signUnsubscribeToken(
  email: string,
  secret = unsubscribeSigningSecret(),
  now = Date.now(),
): string {
  const normalized = normalizeEmail(email);
  const exp = now + UNSUBSCRIBE_TOKEN_TTL_MS;
  const payload = Buffer.from(normalized, 'utf8').toString('base64url');
  const expPart = Buffer.from(String(exp), 'utf8').toString('base64url');
  const sig = signPayload(secret, `${PURPOSE}:${normalized}:${exp}`);
  return `${payload}.${expPart}.${sig}`;
}

/**
 * Mailbox inside a token, or null when the token is missing, tampered, or expired.
 * Two-part links from before expiry was added stay valid until UNSUBSCRIBE_LEGACY_UNTIL_MS.
 */
export function readUnsubscribeToken(
  token: string,
  secret = unsubscribeSigningSecret(),
  now = Date.now(),
): string | null {
  if (!token || token.length > 800) return null;
  const parts = token.split('.');
  if (parts.length === 2) return readLegacyToken(parts[0] ?? '', parts[1] ?? '', secret, now);
  if (parts.length !== 3) return null;
  const [payload, expPart, sig] = parts;
  if (!payload || !expPart || !sig) return null;

  let email = '';
  let expRaw = '';
  try {
    email = Buffer.from(payload, 'base64url').toString('utf8');
    expRaw = Buffer.from(expPart, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!/^\d+$/.test(expRaw)) return null;
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp < now) return null;
  if (!isDeliverableEmail(email)) return null;
  const normalized = normalizeEmail(email);
  const expected = signPayload(secret, `${PURPOSE}:${normalized}:${exp}`);
  if (!signaturesMatch(sig, expected)) return null;
  return normalized;
}

function readLegacyToken(payload: string, sig: string, secret: string, now: number): string | null {
  if (!payload || !sig || now >= UNSUBSCRIBE_LEGACY_UNTIL_MS) return null;
  let email = '';
  try {
    email = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!isDeliverableEmail(email)) return null;
  const normalized = normalizeEmail(email);
  const expected = signPayload(secret, `${PURPOSE}:${normalized}`);
  if (!signaturesMatch(sig, expected)) return null;
  return normalized;
}

export function unsubscribeLink(
  siteUrl: string,
  email: string,
  secret = unsubscribeSigningSecret(),
  locale?: string,
): string {
  const base = siteUrl.replace(/\/$/, '');
  const token = signUnsubscribeToken(email, secret);
  const lang = locale === 'es' ? '&locale=es' : locale === 'en' ? '&locale=en' : '';
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}${lang}`;
}

/** Headers mail clients use for one-click unsubscribe (RFC 8058). */
export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
