import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isDeliverableEmail, isQaOrE2eRecipient, normalizeEmail } from '@/lib/email-address';
import { unsubscribeSigningSecret } from '@/lib/unsubscribe';

const PURPOSE = 'lf-checklist-confirm-v1';

/** Confirm link lifetime. */
export const CHECKLIST_CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;

export function checklistConfirmExpiry(fromMs = Date.now()): Date {
  return new Date(fromMs + CHECKLIST_CONFIRM_TTL_MS);
}

/**
 * qa+, e2e+, and mailboxes at launchforma.com. A lookalike host such as
 * launchforma.com.evil is not included. user+qa+@example.com is not included
 * because the local part has to start with the prefix.
 */
export function isChecklistTestAddress(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (isQaOrE2eRecipient(normalized)) return true;
  const at = normalized.lastIndexOf('@');
  if (at < 1) return false;
  return normalized.slice(at + 1) === 'launchforma.com';
}

export function countsAsRealSubscriber(row: {
  email: string;
  confirmedAt: Date | null;
  isTest: boolean;
  unsubscribed: boolean;
}): boolean {
  if (!row.confirmedAt || row.isTest || row.unsubscribed) return false;
  return !isChecklistTestAddress(row.email);
}

export function isSignupHoneypot(website: string | undefined): boolean {
  return Boolean(website && website.trim().length > 0);
}

export function signChecklistConfirmToken(
  email: string,
  expiresAtMs: number,
  secret = unsubscribeSigningSecret(),
): string {
  const normalized = normalizeEmail(email);
  const payload = Buffer.from(
    JSON.stringify({ e: normalized, exp: expiresAtMs }),
    'utf8',
  ).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${PURPOSE}:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

export type ChecklistTokenRead =
  | { ok: true; email: string; expiresAtMs: number }
  | { ok: false; reason: 'invalid' | 'expired' };

export function readChecklistConfirmToken(
  token: string,
  nowMs: number,
  secret = unsubscribeSigningSecret(),
): ChecklistTokenRead {
  if (!token || token.length > 2048) return { ok: false, reason: 'invalid' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid' };
  const [payload, sig] = parts;
  if (!payload || !sig) return { ok: false, reason: 'invalid' };

  const expected = createHmac('sha256', secret).update(`${PURPOSE}:${payload}`).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: 'invalid' };
  }

  let parsed: { e?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      e?: unknown;
      exp?: unknown;
    };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof parsed.e !== 'string' || typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp)) {
    return { ok: false, reason: 'invalid' };
  }
  if (!isDeliverableEmail(parsed.e)) return { ok: false, reason: 'invalid' };
  if (parsed.exp <= nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, email: normalizeEmail(parsed.e), expiresAtMs: parsed.exp };
}

export function hashChecklistToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function checklistConfirmUrl(token: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return `${base}/api/checklist/confirm?token=${encodeURIComponent(token)}`;
}

export type ChecklistConfirmPlan = 'invalid' | 'expired' | 'unsubscribed' | 'already' | 'deliver';

/**
 * What a confirm click should do. A second click after delivery is already.
 * An unsubscribe that landed after this opt-in blocks delivery.
 */
export function checklistConfirmPlan(input: {
  tokenStatus: 'valid' | 'expired' | 'invalid';
  hashMatches: boolean;
  unsubscribedAfterConsent: boolean;
  checklistSent: boolean;
}): ChecklistConfirmPlan {
  if (input.tokenStatus === 'invalid' || !input.hashMatches) return 'invalid';
  if (input.checklistSent) return 'already';
  if (input.tokenStatus === 'expired') return 'expired';
  if (input.unsubscribedAfterConsent) return 'unsubscribed';
  return 'deliver';
}

/** Repeating unsubscribe keeps one row and refreshes it. */
export function optOutWrite(existing: boolean): 'create' | 'refresh' {
  return existing ? 'refresh' : 'create';
}
