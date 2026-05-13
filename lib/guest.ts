// LaunchForma guest filing support.
//
// Visitors arriving via the marketing CTA can start a filing without
// creating an account. We do this by spinning up a minimal "shadow" User
// record (accountStatus = 'GUEST') and attaching the filing to it. A signed
// random token is stored on the User row AND in an HttpOnly cookie on the
// visitor's browser. A request is treated as a guest iff:
//   1. There is no NextAuth session,
//   2. A `LF_GUEST_TOKEN` cookie is present,
//   3. The cookie matches a User with accountStatus = 'GUEST' and a non-null
//      `guestToken`.
//
// Once the visitor "claims" the account (popup or sign-up), we set their
// password hash, flip accountStatus to 'ACTIVE', clear `guestToken`, and let
// the normal NextAuth credentials provider take over from there.

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';

export const GUEST_COOKIE = 'LF_GUEST_TOKEN';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Generate a high-entropy guest token (~64 hex chars). */
export function newGuestToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Set the guest cookie on the response. Call from server actions / route handlers. */
export function setGuestCookie(token: string) {
  cookies().set(GUEST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/** Clear the guest cookie (e.g. after the user claims their account). */
export function clearGuestCookie() {
  cookies().delete(GUEST_COOKIE);
}

/**
 * Resolve the current guest user from the cookie. Returns null when:
 *   - No cookie is present,
 *   - The cookie does not match any user,
 *   - The matched user is not a GUEST.
 */
export async function getGuestUser(): Promise<{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
} | null> {
  const token = cookies().get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { guestToken: token },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      accountStatus: true,
    },
  });
  if (!user || user.accountStatus !== 'GUEST') return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/**
 * Return the actor currently driving the wizard — either an authenticated
 * NextAuth user OR a guest identified by signed cookie token. Used by the
 * wizard layout, page, and server actions to gate access without forcing a
 * sign-in for first-time visitors.
 */
export async function getWizardActor(authUserId?: string | null, authEmail?: string | null) {
  if (authUserId) {
    return {
      kind: 'user' as const,
      id: authUserId,
      email: authEmail ?? null,
    };
  }
  const guest = await getGuestUser();
  if (guest) {
    return {
      kind: 'guest' as const,
      id: guest.id,
      email: guest.email,
      firstName: guest.firstName,
      lastName: guest.lastName,
    };
  }
  return null;
}
