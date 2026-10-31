import 'server-only';

/** Comma-separated exact emails. Server-only. Empty or unset disables free checkout. */
export const TESTER_CHECKOUT_EMAILS_ENV = 'TESTER_CHECKOUT_EMAILS';

export function parseTesterCheckoutEmails(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

/**
 * Free checkout is an allowlisted mailbox. A tester flag, an email pattern,
 * and the QA cookie do not qualify. An empty list disables the privilege.
 */
export function testerCheckoutAllowed(
  email: string | null | undefined,
  raw: string | null | undefined = process.env.TESTER_CHECKOUT_EMAILS,
): boolean {
  const normalized = email?.trim().toLowerCase() ?? '';
  if (!normalized) return false;
  return parseTesterCheckoutEmails(raw).includes(normalized);
}

/**
 * The no-charge path. A signed-in allowlisted email plus the bypass sentinel.
 * Guests and a tester flag alone are not enough.
 */
export function freeTesterCheckout(input: {
  actorKind: 'user' | 'guest' | null | undefined;
  email: string | null | undefined;
  paymentIntentId: string | null | undefined;
  allowlist?: string | null;
}): boolean {
  if (input.actorKind !== 'user') return false;
  if (input.paymentIntentId !== 'TESTER_BYPASS') return false;
  return testerCheckoutAllowed(input.email, input.allowlist);
}
