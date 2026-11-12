/**
 * Signed-out receipt access for /checkout/success only.
 * Any other app route stays behind sign-in.
 */

export function isCheckoutSuccessPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').split('?')[0]?.split('#')[0] ?? '';
  return path === '/checkout/success' || path === '/es/checkout/success';
}

export function checkoutSuccessQuery(search: string | null | undefined): {
  filingId: string | null;
  sessionId: string | null;
} {
  const raw = (search ?? '').trim().replace(/^\?/, '');
  const params = new URLSearchParams(raw);
  const filingId = params.get('filing')?.trim() || null;
  const sessionId = params.get('session_id')?.trim() || null;
  return { filingId, sessionId };
}

/**
 * The guest cookie may see the receipt only when it owns the filing and
 * the charge is already paid. A missing cookie, another guest, or an
 * unpaid filing is a deny, which the layout turns into the sign-in redirect.
 */
export function guestMaySeePaidReceipt(input: {
  pathname: string | null | undefined;
  cookieUserId: string | null | undefined;
  filingUserId: string | null | undefined;
  hasSucceededPayment: boolean;
  checkoutSessionPaid: boolean;
}): boolean {
  if (!isCheckoutSuccessPath(input.pathname)) return false;
  if (!input.cookieUserId || !input.filingUserId) return false;
  if (input.cookieUserId !== input.filingUserId) return false;
  return input.hasSucceededPayment || input.checkoutSessionPaid;
}
