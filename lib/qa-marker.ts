/** First-party marker for a browser that asked to be treated as QA. */
export const QA_COOKIE = 'lf_qa';
/** Set by the server when this browser's account is already a tester. */
export const TESTER_COOKIE = 'lf_tester';
export const QA_MAX_AGE = 60 * 60 * 24;

/**
 * `?qa=1` or a campaign that starts with `qa_`. Only used to suppress
 * measurement and to mark a guest draft. It never grants access.
 */
export function qaMarkerRequested(search: string | null | undefined): boolean {
  const raw = search ?? '';
  const query = raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(query);
  if (params.get('qa') === '1') return true;
  return (params.get('utm_campaign') ?? '').toLowerCase().startsWith('qa_');
}

/** The marker is armed only on the start and ad-landing URLs. */
export function qaMarkerPathAllowed(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').split('?')[0]?.split('#')[0] || '/';
  return path === '/start' || path === '/es/start' || path.startsWith('/lp/') || path.startsWith('/es/lp/');
}

export function hasNamedCookie(cookie: string | null | undefined, name: string): boolean {
  return new RegExp(`(?:^|;\\s*)${name}=1(?:;|$)`).test(cookie ?? '');
}

export function hasQaCookie(cookie: string | null | undefined): boolean {
  return hasNamedCookie(cookie, QA_COOKIE);
}

export function hasTesterCookie(cookie: string | null | undefined): boolean {
  return hasNamedCookie(cookie, TESTER_COOKIE);
}

export function qaCookieHeader(secure: boolean): string {
  return `${QA_COOKIE}=1; Path=/; Max-Age=${QA_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Flags for PostHog. A QA browser or a known tester is both test and internal. */
export function testTrafficProps(cookie: string | null | undefined): {
  is_test?: true;
  is_internal?: true;
} {
  if (!hasQaCookie(cookie) && !hasTesterCookie(cookie)) return {};
  return { is_test: true, is_internal: true };
}

/**
 * What a QA signal may write. A qa+ mailbox marks that account.
 * The `lf_qa` cookie marks a guest user and every new filing. It does not
 * turn an existing account into a tester, so it cannot grant tester checkout.
 */
export function qaGuestStampPlan(input: {
  emailHit: boolean;
  qaMarked?: boolean;
  accountStatus?: string | null;
}): { markUser: boolean; markFiling: boolean } {
  if (input.emailHit) return { markUser: true, markFiling: true };
  if (!input.qaMarked) return { markUser: false, markFiling: false };
  return {
    markUser: input.accountStatus === 'GUEST',
    markFiling: true,
  };
}

/** True when this request is QA or the owner is already a tester. */
export function filingIsTestAtCreation(input: {
  qaMarked?: boolean | null;
  isTester?: boolean | null;
}): boolean {
  return input.qaMarked === true || input.isTester === true;
}

/** Spread into `prisma.filing.create` so isTest is set on the insert. */
export function filingTestCreateFields(input: {
  qaMarked?: boolean | null;
  isTester?: boolean | null;
}): { isTest: true } | Record<string, never> {
  return filingIsTestAtCreation(input) ? { isTest: true } : {};
}

/** Spread into a new guest `user.create`. Never used for an existing account. */
export function guestTesterCreateFields(input: {
  qaMarked?: boolean | null;
  emailHit?: boolean | null;
}): { isTester: true } | Record<string, never> {
  if (input.qaMarked || input.emailHit) return { isTester: true };
  return {};
}

/** Stripe metadata values are strings. Live charges omit the key. */
export function paymentIntentIsTest(input: {
  qaMarked?: boolean | null;
  isTester?: boolean | null;
  filingIsTest?: boolean | null;
}): boolean {
  return input.qaMarked === true || input.isTester === true || input.filingIsTest === true;
}

export function stripeIsTestMetadata(
  isTest: boolean,
): { isTest: 'true' } | Record<string, never> {
  return isTest ? { isTest: 'true' } : {};
}
