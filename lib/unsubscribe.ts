import { createHmac, timingSafeEqual } from 'node:crypto';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';

const PURPOSE = 'lf-unsub-v1';

export function unsubscribeSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.UNSUBSCRIBE_SECRET?.trim() ||
    env.NEXTAUTH_SECRET?.trim() ||
    'launchforma-dev-unsubscribe'
  );
}

/** Stable signed token for one mailbox. The link keeps working until the secret rotates. */
export function signUnsubscribeToken(email: string, secret = unsubscribeSigningSecret()): string {
  const normalized = normalizeEmail(email);
  const payload = Buffer.from(normalized, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(`${PURPOSE}:${normalized}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** Mailbox inside a token, or null when the token is missing, tampered, or not an email. */
export function readUnsubscribeToken(token: string, secret = unsubscribeSigningSecret()): string | null {
  if (!token || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  let email = '';
  try {
    email = Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!isDeliverableEmail(email)) return null;
  const normalized = normalizeEmail(email);
  const expected = createHmac('sha256', secret).update(`${PURPOSE}:${normalized}`).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return normalized;
}

export function unsubscribeLink(siteUrl: string, email: string, secret = unsubscribeSigningSecret()): string {
  const base = siteUrl.replace(/\/$/, '');
  const token = signUnsubscribeToken(email, secret);
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Headers mail clients use for one-click unsubscribe (RFC 8058). */
export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
