import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';

const TRANSIENT_BOUNCE_TYPES = new Set([
  'transient',
  'temporary',
  'soft',
  'transientfailure',
]);

export interface ParsedEmailBounce {
  emails: string[];
  /** False for mailbox-full / transient failures, which are not suppressed. */
  suppress: boolean;
  detail: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recipientList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out: string[] = [];
  for (const item of raw) {
    if (!isDeliverableEmail(item)) continue;
    const email = normalizeEmail(item);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}

/**
 * Transient bounces (full mailbox) should not permanently block the address.
 * Missing or unknown types are treated as permanent — that is the Resend
 * hard-bounce case this webhook exists to stop.
 */
export function shouldSuppressBounce(type: string | null | undefined): boolean {
  if (!type?.trim()) return true;
  return !TRANSIENT_BOUNCE_TYPES.has(type.trim().toLowerCase());
}

/** Pull recipients out of a Resend `email.bounced` event. Null for other types. */
export function parseEmailBounce(event: unknown): ParsedEmailBounce | null {
  const root = asRecord(event);
  if (!root || root.type !== 'email.bounced') return null;
  const data = asRecord(root.data) ?? {};
  const emails = recipientList(data.to ?? data.email);
  const bounce = asRecord(data.bounce);
  const bounceType = typeof bounce?.type === 'string' ? bounce.type : null;
  const message =
    (typeof bounce?.message === 'string' && bounce.message) ||
    (typeof data.message === 'string' && data.message) ||
    null;
  return {
    emails,
    suppress: shouldSuppressBounce(bounceType),
    detail: message ? message.slice(0, 500) : null,
  };
}
