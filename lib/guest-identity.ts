/**
 * Guest filing identity rules.
 *
 * A logged-out visitor gets a GUEST user and an httpOnly token before any
 * account exists. Until they type a real email, User.email is a placeholder
 * on a domain the resume drip skips. Checkout refuses to charge a guest.
 * Signing up or signing in on this browser moves the draft onto that account
 * when the guest mailbox is still a placeholder, or when it is the same email.
 */

export const GUEST_PLACEHOLDER_DOMAIN = 'guest.launchforma.invalid';

/** Server and payment-intent fallback when a guest reaches charge. */
export const CHECKOUT_ACCOUNT_REQUIRED = 'Create an account before you pay.';

export function placeholderGuestEmail(token: string): string {
  const local = token.replace(/[^a-f0-9]/gi, '').slice(0, 24).toLowerCase() || 'guest';
  return `guest.${local}@${GUEST_PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderGuestEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${GUEST_PLACEHOLDER_DOMAIN}`);
}

export type GuestEmailOwner = 'free' | 'self' | 'guest' | 'account';

/** keep_own never moves the draft or copies another guest's cookie. */
export type GuestEmailPlan = 'write' | 'noop' | 'keep_own' | 'hold_for_signin';

/** What to do with an email the visitor typed onto a guest draft. */
export function planGuestEmailWrite(owner: GuestEmailOwner): GuestEmailPlan {
  if (owner === 'self') return 'noop';
  if (owner === 'free') return 'write';
  if (owner === 'guest') return 'keep_own';
  return 'hold_for_signin';
}

export type StartGuestOwner = 'free' | 'guest' | 'account';

export type StartGuestSessionPlan = 'create' | 'separate' | 'sign_in';

/**
 * An email that already belongs to anyone gets a new guest for this browser,
 * or a sign-in redirect. It never reuses that user's row or cookie.
 */
export function planStartGuestSession(owner: StartGuestOwner): StartGuestSessionPlan {
  if (owner === 'account') return 'sign_in';
  if (owner === 'guest') return 'separate';
  return 'create';
}

/** Address this browser typed when it cannot be stored on the unique User.email. */
export function readTypedGuestEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { typedGuestEmail?: unknown };
    if (typeof parsed?.typedGuestEmail !== 'string') return null;
    const email = parsed.typedGuestEmail.trim().toLowerCase();
    if (!email || email.endsWith('.invalid')) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return email;
  } catch {
    return null;
  }
}

export function checkoutAllowsPayment(kind: 'user' | 'guest' | null | undefined): boolean {
  return kind === 'user';
}

export interface GuestDraftAttachPlan {
  action: 'none' | 'already_attached' | 'move';
  filingIds: string[];
  retireGuestUserId?: string;
}

/**
 * Same user (password claim or magic link): the draft is already on the account.
 * A different user: move the guest drafts, then retire the empty guest row.
 */
export function planGuestDraftAttach(input: {
  guestUserId: string | null;
  accountUserId: string;
  draftFilingIds: string[];
}): GuestDraftAttachPlan {
  if (!input.guestUserId) return { action: 'none', filingIds: [] };
  if (input.guestUserId === input.accountUserId) {
    return { action: 'already_attached', filingIds: input.draftFilingIds };
  }
  return {
    action: 'move',
    filingIds: input.draftFilingIds,
    retireGuestUserId: input.guestUserId,
  };
}

/**
 * Placeholder drafts follow whichever account this browser signs into.
 * A guest who already typed a real email only attaches to that same mailbox,
 * so signing into a different account does not take the draft.
 */
export function shouldAttachGuestDraft(input: {
  guestEmail: string;
  accountEmail: string;
  /** Real addresses this browser typed onto its own drafts. */
  typedEmails?: string[];
}): boolean {
  const account = input.accountEmail.trim().toLowerCase();
  if (!isPlaceholderGuestEmail(input.guestEmail)) {
    return input.guestEmail.trim().toLowerCase() === account;
  }
  const typed = (input.typedEmails ?? [])
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email && !email.endsWith('.invalid') && !isPlaceholderGuestEmail(email));
  if (typed.length === 0) return true;
  return typed.includes(account);
}

export function wizardHrefForDraft(
  filingId: string,
  currentStep: number | null | undefined,
): string {
  const step = currentStep && currentStep >= 1 ? Math.trunc(currentStep) : 2;
  return `/wizard/${filingId}/${step}`;
}

/** Resume links re-issue the guest cookie only for the guest who owns a draft. */
export function guestResumeAllowed(input: {
  accountStatus: string | null | undefined;
  guestToken: string | null | undefined;
  token: string;
  filingUserId: string | null | undefined;
  guestUserId: string | null | undefined;
  filingStatus: string | null | undefined;
}): boolean {
  if (!input.token || !input.guestUserId || !input.filingUserId) return false;
  if (input.accountStatus !== 'GUEST') return false;
  if (!input.guestToken || input.guestToken !== input.token) return false;
  if (input.filingUserId !== input.guestUserId) return false;
  return input.filingStatus === 'DRAFT';
}

export type LoginLinkClaimPlan = 'allow' | 'claim_guest' | 'deny';

/** Magic links sign in an active customer, or turn the guest row into that account. */
export function loginLinkClaimPlan(accountStatus: string, role: string): LoginLinkClaimPlan {
  if (role === 'ADMIN') return 'deny';
  if (accountStatus === 'ACTIVE') return 'allow';
  if (accountStatus === 'GUEST') return 'claim_guest';
  return 'deny';
}
