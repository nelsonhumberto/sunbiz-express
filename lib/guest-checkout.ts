/**
 * Guest formation checkout decisions.
 *
 * The guest who owns the draft may pay after a real email is stored on that
 * same user. An email that already belongs to a non-guest account is refused:
 * we do not charge, attach the filing, or sign anyone in from the address
 * alone. A different guest cookie cannot create a PaymentIntent for the draft.
 */

import { isDeliverableEmail, normalizeEmail } from './email-address';
import { isPlaceholderGuestEmail } from './guest-identity';

/** JSON `code` when the typed email belongs to a non-guest account. */
export const GUEST_CHECKOUT_EXISTING_ACCOUNT_CODE = 'existing_account';

/** JSON `code` when the email is already on a different guest row. */
export const GUEST_CHECKOUT_EMAIL_UNAVAILABLE_CODE = 'email_unavailable';

export interface GuestCheckoutEmailOwner {
  id: string;
  accountStatus: string;
}

export type GuestPaymentIntentDecision =
  | { ok: true; email: string }
  | {
      ok: false;
      reason:
        | 'not_owner'
        | 'not_draft'
        | 'already_paid'
        | 'invalid_email'
        | 'existing_account'
        | 'email_held';
    };

/**
 * Whether this guest may create the formation PaymentIntent.
 * Amount, idempotency, and Stripe calls stay with the caller.
 */
export function authorizeGuestFormationPayment(input: {
  guestUserId: string | null;
  filingUserId: string | null;
  filingStatus: string | null;
  alreadyPaid: boolean;
  email: string;
  emailOwner: GuestCheckoutEmailOwner | null;
}): GuestPaymentIntentDecision {
  if (!input.guestUserId || !input.filingUserId || input.guestUserId !== input.filingUserId) {
    return { ok: false, reason: 'not_owner' };
  }
  if (input.filingStatus !== 'DRAFT') return { ok: false, reason: 'not_draft' };
  if (input.alreadyPaid) return { ok: false, reason: 'already_paid' };

  const email = normalizeEmail(input.email ?? '');
  if (!isDeliverableEmail(email) || isPlaceholderGuestEmail(email)) {
    return { ok: false, reason: 'invalid_email' };
  }

  if (input.emailOwner && input.emailOwner.id !== input.guestUserId) {
    if (input.emailOwner.accountStatus !== 'GUEST') {
      return { ok: false, reason: 'existing_account' };
    }
    return { ok: false, reason: 'email_held' };
  }

  return { ok: true, email };
}

/** Filing JSON written before the PaymentIntent so receipts have the real address. */
export function filingCheckoutEmailDetails(
  existing: Record<string, unknown> | null | undefined,
  email: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  delete next.pendingAccountEmail;
  next.checkoutEmail = email;
  next.typedGuestEmail = email;
  return next;
}

export type GuestAccountClaimPlan =
  | { action: 'claim'; userId: string; email: string }
  | { action: 'skip'; reason: 'not_guest' | 'invalid_email' | 'existing_account' | 'email_held' };

/**
 * Promote the paying guest row only. Never claims a different user that
 * already owns the mailbox, guest or not.
 */
export function planGuestAccountClaim(input: {
  userId: string;
  accountStatus: string;
  email: string;
  emailOwner: GuestCheckoutEmailOwner | null;
}): GuestAccountClaimPlan {
  if (input.accountStatus !== 'GUEST') return { action: 'skip', reason: 'not_guest' };
  const email = normalizeEmail(input.email ?? '');
  if (!isDeliverableEmail(email) || isPlaceholderGuestEmail(email)) {
    return { action: 'skip', reason: 'invalid_email' };
  }
  if (input.emailOwner && input.emailOwner.id !== input.userId) {
    if (input.emailOwner.accountStatus !== 'GUEST') {
      return { action: 'skip', reason: 'existing_account' };
    }
    return { action: 'skip', reason: 'email_held' };
  }
  return { action: 'claim', userId: input.userId, email };
}

/**
 * A repeat webhook must not insert another Payment. It may still claim a
 * guest whose first delivery recorded the charge and then died. Once the
 * row is ACTIVE, it does not send another set-password email.
 */
export function planWebhookPaidReplay(input: {
  paymentAlreadyRecorded: boolean;
  accountStatus: string | null | undefined;
}): { recordPayment: boolean; claimAccount: boolean } {
  return {
    recordPayment: !input.paymentAlreadyRecorded,
    claimAccount: input.accountStatus === 'GUEST',
  };
}

/**
 * Session creation is allowed only for the row we just promoted, loaded by
 * that row's id. An email match on a different user is not a session.
 */
export function maySignInClaimedGuest(input: {
  claimedUserId: string;
  claimedEmail: string;
  loadedUserId: string;
  loadedEmail: string;
  loadedStatus: string;
}): boolean {
  if (input.claimedUserId !== input.loadedUserId) return false;
  if (input.loadedStatus !== 'ACTIVE') return false;
  const claimed = normalizeEmail(input.claimedEmail ?? '');
  const loaded = normalizeEmail(input.loadedEmail ?? '');
  if (!claimed || claimed !== loaded) return false;
  return isDeliverableEmail(loaded) && !isPlaceholderGuestEmail(loaded);
}

export type GuestClaimFollowUp = 'open_session' | 'claimed_sign_in' | 'leave';

/**
 * A guest claim that this PaymentIntent already finished still uses the
 * set-password success path. A different PaymentIntent or a different user
 * does not.
 */
export function planGuestClaimFollowUp(input: {
  actorId: string;
  filingId: string;
  paymentIntentUserId?: string | null;
  paymentIntentFilingId?: string | null;
  claim: {
    claimed: boolean;
    alreadyClaimed?: boolean;
    email?: string;
    userId?: string;
    password?: string;
  };
}): GuestClaimFollowUp {
  const piUser = input.paymentIntentUserId ?? '';
  const piFiling = input.paymentIntentFilingId ?? '';
  const sameIntent =
    (!piUser || piUser === input.actorId) && (!piFiling || piFiling === input.filingId);
  if (!sameIntent) return 'leave';
  if (input.claim.claimed && input.claim.email && input.claim.password) return 'open_session';
  const email = normalizeEmail(input.claim.email ?? '');
  if (
    input.claim.alreadyClaimed &&
    input.claim.userId === input.actorId &&
    piUser === input.actorId &&
    isDeliverableEmail(email) &&
    !isPlaceholderGuestEmail(email)
  ) {
    return 'claimed_sign_in';
  }
  return 'leave';
}

/**
 * The browser lost the guest cookie because this PaymentIntent's webhook
 * already promoted that same user. Replay is the claimed sign-in, not a
 * new account.
 */
export function planRecoveredGuestClaim(input: {
  filingId: string;
  filingUserId: string;
  paymentIntentId: string;
  paymentIntentStatus: string;
  paymentIntentUserId?: string | null;
  paymentIntentFilingId?: string | null;
  recordedPaymentIntentId?: string | null;
  recordedFilingId?: string | null;
  recordedUserId?: string | null;
  accountStatus?: string | null;
  accountEmail?: string | null;
}): { followUp: 'claimed_sign_in'; email: string } | { followUp: 'leave' } {
  const email = normalizeEmail(input.accountEmail ?? '');
  if (input.paymentIntentStatus !== 'succeeded') return { followUp: 'leave' };
  if (!input.paymentIntentId || input.paymentIntentId === 'TESTER_BYPASS') return { followUp: 'leave' };
  if (input.paymentIntentUserId !== input.filingUserId) return { followUp: 'leave' };
  if (input.paymentIntentFilingId !== input.filingId) return { followUp: 'leave' };
  if (input.recordedPaymentIntentId !== input.paymentIntentId) return { followUp: 'leave' };
  if (input.recordedFilingId !== input.filingId) return { followUp: 'leave' };
  if (input.recordedUserId !== input.filingUserId) return { followUp: 'leave' };
  if (input.accountStatus !== 'ACTIVE') return { followUp: 'leave' };
  if (!isDeliverableEmail(email) || isPlaceholderGuestEmail(email)) return { followUp: 'leave' };
  return { followUp: 'claimed_sign_in', email };
}

const CANONICAL_SET_PASSWORD_SITE = 'https://launchforma.com';

function httpsOrigin(value: string | null | undefined, allowHttpLocal: boolean): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase();
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (url.protocol === 'http:' && allowHttpLocal && local) return url.origin;
  if (url.protocol !== 'https:') return null;
  if (!hostname) return null;
  return url.origin;
}

/**
 * Set-password links on a preview deployment must hit that deployment.
 * Production always uses the canonical site. A request Host or Origin cannot
 * choose the production link.
 */
export function guestSetPasswordSiteUrl(input: {
  vercelEnv?: string | null;
  canonicalUrl?: string | null;
  vercelUrl?: string | null;
  branchUrl?: string | null;
  requestOrigin?: string | null;
}): string {
  const canonical = httpsOrigin(input.canonicalUrl, false) ?? CANONICAL_SET_PASSWORD_SITE;
  if ((input.vercelEnv ?? '').trim() === 'production') return canonical;

  const vercelOrigin = httpsOrigin(input.vercelUrl, false);
  const branchOrigin = httpsOrigin(input.branchUrl, false);
  const request = httpsOrigin(input.requestOrigin, true);
  const allowedHosts = new Set(
    [vercelOrigin, branchOrigin]
      .filter((value): value is string => Boolean(value))
      .map((value) => new URL(value).host.toLowerCase()),
  );
  if (request) {
    const requestUrl = new URL(request);
    const hostname = requestUrl.hostname.toLowerCase();
    const local = hostname === 'localhost' || hostname === '127.0.0.1';
    if (local || allowedHosts.has(requestUrl.host.toLowerCase())) return request;
  }
  return vercelOrigin ?? branchOrigin ?? canonical;
}

/** Stored on the filing until the guest has seen the set-password success page. */
export const GUEST_SET_PASSWORD_PENDING_KEY = 'guestSetPasswordPending';

export function withGuestSetPasswordPending(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return { ...(details ?? {}), [GUEST_SET_PASSWORD_PENDING_KEY]: true };
}

export function withoutGuestSetPasswordPending(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next = { ...(details ?? {}) };
  delete next[GUEST_SET_PASSWORD_PENDING_KEY];
  return next;
}

export function filingNeedsSetPasswordPrompt(details: unknown): boolean {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
  return (details as Record<string, unknown>)[GUEST_SET_PASSWORD_PENDING_KEY] === true;
}

/**
 * After payment the wizard is no longer a draft, so it redirects.
 * A guest who still needs a password stays on the success page.
 * Every other submitted filing keeps the filing dashboard.
 */
export function submittedFilingHref(filingId: string, details: unknown): string {
  if (filingNeedsSetPasswordPrompt(details)) {
    return `/checkout/success?filing=${filingId}&setPassword=1`;
  }
  return `/dashboard/filings/${filingId}`;
}
