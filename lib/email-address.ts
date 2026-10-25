/**
 * Recipient checks shared by sendEmail. Kept free of the mailer so unit
 * tests don't boot Prisma.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reserved mailboxes are never handed to a provider. `.invalid` covers guest placeholders. */
export function isReservedMailbox(value: string): boolean {
  const email = value.trim().toLowerCase();
  return email.endsWith('.invalid') || email.endsWith('@guest.launchforma.invalid');
}

/** True when `value` is a single plausible mailbox we can hand to a provider. */
export function isDeliverableEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (!email || email.length > 254) return false;
  if (email.includes('..')) return false;
  if (isReservedMailbox(email)) return false;
  return EMAIL_RE.test(email);
}

/** Lower-case mailbox used as the suppression-list key. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const TEST_LOCAL_PREFIXES = ['qa+', 'e2e+'] as const;

/**
 * QA and end-to-end fixtures use these local-part prefixes. Matching is
 * case-insensitive and only the start of the local part counts, so a normal
 * plus-address such as user+e2e+@example.com still sends.
 */
export function isQaOrE2eRecipient(value: string): boolean {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0) return false;
  const local = email.slice(0, at);
  return TEST_LOCAL_PREFIXES.some((prefix) => local.startsWith(prefix));
}
