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
