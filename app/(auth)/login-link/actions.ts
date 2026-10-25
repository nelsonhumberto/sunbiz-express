'use server';

import { cookies } from 'next/headers';
import { redirectLocalized } from '@/lib/locale-redirect';
import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';
import { findLoginLink, LOGIN_LINK_COOKIE } from '@/lib/login-link';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { safeRedirectPath } from '@/lib/utils';

export async function continueWithLoginLink() {
  if (checkActionRateLimit('login-link', 10, 15 * 60 * 1000)) return await redirectLocalized('/sign-in');

  const token = cookies().get(LOGIN_LINK_COOKIE)?.value ?? '';
  const link = await findLoginLink(token);
  if (!link) return await redirectLocalized('/sign-in');

  try {
    await signIn('login-link', { token, redirect: false });
  } catch (err) {
    // A used/expired link lands back on the page, which shows the expired state.
    if (err instanceof AuthError) return await redirectLocalized('/login-link');
    throw err;
  }

  cookies().set(LOGIN_LINK_COOKIE, '', { path: '/login-link', maxAge: 0 });
  return await redirectLocalized(safeRedirectPath(link.nextPath) ?? '/dashboard');
}
