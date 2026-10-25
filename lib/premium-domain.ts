/**
 * Premium includes a .com for year 1 (see lib/pricing.ts, domain_com), but
 * nothing in the app registers it. This alert tells admin@launchforma.com
 * to register the domain by hand.
 *
 * Test orders do not alert. Customer payment mail (PAYMENT_CONFIRMATION)
 * still sends for tester bypass and Stripe test-mode charges. This alert is
 * an operational task, so it follows post-formation mail and draft recovery:
 * filing.isTest, or a payment marked isTest (tester bypass, mock ids, or
 * Stripe livemode false), is skipped and writes no EmailNotification row.
 *
 * Retries reuse the EmailNotification row for this filing and DOMAIN_REGISTER,
 * the same find-first dedupe draft re-engagement uses. Any existing row
 * (QUEUED, SENT, FAILED, or SKIPPED_TEST) blocks another automatic send, so a
 * webhook retry does not send a second alert. A failed first attempt is not
 * retried by the webhook. An admin resend from the outbox creates a new row
 * on purpose.
 *
 * The "mark domain registered" toggle lives in Filing.optionalDetails under
 * domainRegisteredAt. That column is already JSON. Wizard writers spread the
 * previous object, so the key survives a later save. No schema change.
 */
import { prisma } from './db';
import { sendEmail } from './email';
import { logger } from './logger';
import { safeParseJson } from './utils';

export const PREMIUM_DOMAIN_ALERT_TYPE = 'DOMAIN_REGISTER' as const;
export const PREMIUM_DOMAIN_ALERT_EMAIL = 'admin@launchforma.com';
export const DOMAIN_REGISTERED_AT_KEY = 'domainRegisteredAt';

/** Keys a future post-payment form can write. Checkout does not set these today. */
const PREFERRED_DOMAIN_KEYS = ['preferredDomain', 'domainName'] as const;

export function premiumDomainOrderLabel(input: {
  businessName?: string | null;
  filingId: string;
}): string {
  const name = input.businessName?.replace(/[\r\n]+/g, ' ').trim();
  return (name || input.filingId).slice(0, 120);
}

export function premiumDomainAdminUrl(
  filingId: string,
  siteUrl: string | null | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  const base = (siteUrl?.trim() || 'https://launchforma.com').replace(/\/$/, '');
  return `${base}/admin/filings/${filingId}`;
}

export function readPreferredDomain(optionalDetails: string | null | undefined): string | null {
  const parsed = safeParseJson<Record<string, unknown> | null>(optionalDetails, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  for (const key of PREFERRED_DOMAIN_KEYS) {
    const value = parsed[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/[\r\n]/g, '').trim();
    if (!trimmed || trimmed.length > 253 || /\s/.test(trimmed)) continue;
    return trimmed;
  }
  return null;
}

export function readDomainRegisteredAt(optionalDetails: string | null | undefined): string | null {
  const parsed = safeParseJson<Record<string, unknown> | null>(optionalDetails, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const value = parsed[DOMAIN_REGISTERED_AT_KEY];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Merge the admin mark into optionalDetails without dropping other keys
 * (processing option, encrypted member tax ids, and so on). Refuses to
 * rewrite a value that is not a JSON object.
 */
export function withDomainRegisteredMark(
  optionalDetails: string | null,
  registered: boolean,
  atIso: string,
): { ok: true; json: string } | { ok: false } {
  let prev: Record<string, unknown> = {};
  if (optionalDetails && optionalDetails.trim()) {
    try {
      const parsed = JSON.parse(optionalDetails) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false };
      prev = { ...(parsed as Record<string, unknown>) };
    } catch {
      return { ok: false };
    }
  }
  if (registered) prev[DOMAIN_REGISTERED_AT_KEY] = atIso;
  else delete prev[DOMAIN_REGISTERED_AT_KEY];
  return { ok: true, json: JSON.stringify(prev) };
}

/** Paid Premium formation with a real (non-test) succeeded payment. */
export function showsManualDomainBadge(input: {
  serviceTier: string;
  isTest: boolean;
  payments: ReadonlyArray<{ status: string; isTest: boolean }>;
}): boolean {
  if (input.isTest) return false;
  if (input.serviceTier !== 'PREMIUM') return false;
  return input.payments.some((payment) => payment.status === 'SUCCEEDED' && payment.isTest === false);
}

export async function notifyPremiumDomainRegistration(input: {
  filingId: string;
  paymentIsTest: boolean;
}): Promise<'sent' | 'skipped' | 'duplicate'> {
  if (input.paymentIsTest) return 'skipped';

  const filing = await prisma.filing.findUnique({
    where: { id: input.filingId },
    select: {
      id: true,
      isTest: true,
      serviceTier: true,
      businessName: true,
      optionalDetails: true,
      userId: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  if (!filing || filing.isTest || filing.serviceTier !== 'PREMIUM') return 'skipped';

  const existing = await prisma.emailNotification.findFirst({
    where: { filingId: filing.id, notificationType: PREMIUM_DOMAIN_ALERT_TYPE },
    select: { id: true },
  });
  if (existing) return 'duplicate';

  const customerName = `${filing.user.firstName} ${filing.user.lastName}`.replace(/\s+/g, ' ').trim();
  const preferred = readPreferredDomain(filing.optionalDetails);
  await sendEmail({
    type: PREMIUM_DOMAIN_ALERT_TYPE,
    to: PREMIUM_DOMAIN_ALERT_EMAIL,
    filingId: filing.id,
    userId: filing.userId,
    step: PREMIUM_DOMAIN_ALERT_TYPE,
    context: {
      businessName: filing.businessName ?? undefined,
      domainFilingId: filing.id,
      domainCustomerName: customerName || undefined,
      domainCustomerEmail: filing.user.email,
      domainAdminUrl: premiumDomainAdminUrl(filing.id),
      domainPreferred: preferred ?? undefined,
    },
  });
  return 'sent';
}

/** Best-effort wrapper so a mail failure never blocks checkout or submission. */
export async function notifyPremiumDomainRegistrationSafely(input: {
  filingId: string;
  paymentIsTest: boolean;
}): Promise<'sent' | 'skipped' | 'duplicate'> {
  try {
    return await notifyPremiumDomainRegistration(input);
  } catch (err) {
    logger.error(
      'premium domain alert failed',
      { area: 'checkout', entityId: input.filingId, tag: 'premium-domain' },
      err,
    );
    return 'skipped';
  }
}
