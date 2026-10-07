import { NextRequest, NextResponse } from 'next/server';
import { LOGIN_LINK_COOKIE, LOGIN_LINK_TOKEN_PATTERN } from '@/lib/login-link';

export const dynamic = 'force-dynamic';

/**
 * Entry point for emailed one-time sign-in links. The token moves out of the
 * URL into a short-lived HttpOnly cookie, so the page analytics records
 * (/login-link) never contains it. Nothing is consumed on GET: mail scanners
 * that prefetch links can't burn the token.
 */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const res = NextResponse.redirect(new URL('/login-link', request.url), 303);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  if (LOGIN_LINK_TOKEN_PATTERN.test(token)) {
    res.cookies.set(LOGIN_LINK_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/login-link',
      maxAge: 15 * 60,
    });
  }
  return res;
}
