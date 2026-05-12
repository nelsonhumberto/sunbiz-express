import { NextRequest, NextResponse } from 'next/server';
import { STATE_CODE_TO_SLUG } from '@/lib/marketing-states';

const ACTIVE_FORMATION_STATES = new Set(['FL', 'WY', 'DE']);

/**
 * Geo + preference-aware routing middleware.
 *
 * Behavior:
 *   - On every request: if `?state=XX` is present and XX is an active
 *     formation state (FL/WY/DE), persist the choice in the `preferred_state`
 *     cookie so subsequent navigations (sign-up → dashboard → wizard) carry
 *     it forward without polluting URLs.
 *   - At "/" only:
 *       1. If `?state=` is in the URL, render whatever the page does with it.
 *       2. If `preferred_state` cookie is set, stick to "/" (the homepage
 *          honors the preference for hero/pricing/CTA).
 *       3. If `geo_redirected` cookie is set, skip auto-redirect.
 *       4. Otherwise look at Vercel geo headers and redirect to the matching
 *          `/states/<slug>` landing page.
 */
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const UTM_COOKIE = 'lf_utm';
const UTM_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  let response: NextResponse | null = null;

  // Capture full UTM attribution set into a single JSON cookie so it
  // survives page navigations and lands on the sign-up / wizard actions.
  const hasUtm = UTM_PARAMS.some((p) => searchParams.has(p));
  if (hasUtm) {
    const utmData: Record<string, string> = {};
    for (const key of UTM_PARAMS) {
      const val = searchParams.get(key);
      if (val) utmData[key] = val;
    }
    if (Object.keys(utmData).length > 0) {
      if (!response) response = NextResponse.next();
      response.cookies.set(UTM_COOKIE, JSON.stringify(utmData), {
        path: '/',
        sameSite: 'lax',
        maxAge: UTM_MAX_AGE,
      });
    }
  }

  // Capture explicit ?state=XX choices from anywhere in the marketing/auth
  // funnel into the preferred-state cookie.
  const stateParam = searchParams.get('state');
  if (stateParam) {
    const upper = stateParam.toUpperCase();
    if (ACTIVE_FORMATION_STATES.has(upper) && request.cookies.get('preferred_state')?.value !== upper) {
      if (!response) response = NextResponse.next();
      response.cookies.set('preferred_state', upper, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  if (pathname !== '/') return response ?? NextResponse.next();
  if (searchParams.has('state')) return response ?? NextResponse.next();
  if (request.cookies.has('preferred_state')) return response ?? NextResponse.next();
  if (request.cookies.has('geo_redirected')) return response ?? NextResponse.next();

  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const region = request.headers.get('x-vercel-ip-country-region') ?? '';

  if (country !== 'US' || !region) return response ?? NextResponse.next();
  if (region === 'FL') return response ?? NextResponse.next();

  const slug = STATE_CODE_TO_SLUG[region];
  if (!slug) return response ?? NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = `/states/${slug}`;
  target.search = '';

  const redirectResponse = NextResponse.redirect(target, { status: 302 });
  redirectResponse.cookies.set('geo_redirected', '1', {
    path: '/',
    sameSite: 'lax',
  });
  return redirectResponse;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
