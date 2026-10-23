/**
 * Recipient checks shared by sendEmail. Kept free of the mailer so unit
 * tests don't boot Prisma.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `value` is a single plausible mailbox we can hand to a provider. */
export function isDeliverableEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (!email || email.length > 254) return false;
  if (email.includes('..')) return false;
  return EMAIL_RE.test(email);
}

/** Lower-case mailbox used as the suppression-list key. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
