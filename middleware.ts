import { NextRequest, NextResponse } from 'next/server';
import { STATE_CODE_TO_SLUG } from '@/lib/marketing-states';
import { LOCALE_COOKIE, locales, type Locale } from '@/i18n/config';

const ACTIVE_FORMATION_STATES = new Set(['FL', 'WY', 'DE']);

/**
 * Geo + preference-aware routing middleware.
 *
 * Behavior:
 *   - On every request:
 *       • If `?lang=es` (or any supported locale) is present, persist it in
 *         the `NEXT_LOCALE` cookie AND mutate the request cookies so the
 *         current page render uses the new locale immediately. This is what
 *         lets Spanish-language Google Ads land on `?lang=es` URLs and have
 *         the very first paint already be in Spanish.
 *       • If `?state=XX` is an active formation state (FL/WY/DE), persist
 *         the choice in the `preferred_state` cookie so subsequent
 *         navigations (sign-up → dashboard → wizard) carry it forward
 *         without polluting URLs.
 *       • Capture UTM params into a JSON `lf_utm` cookie so ad attribution
 *         survives the funnel.
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
const LOCALE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setLocaleCookie(res: NextResponse, locale: Locale) {
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: LOCALE_MAX_AGE,
  });
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  let response: NextResponse | null = null;

  // Capture `?lang=` *first* so any later short-circuit return paths still
  // carry the locale cookie. We both:
  //   1. mutate request.cookies — so this request's server components
  //      pick up the new value via i18n/request.ts; and
  //   2. set the cookie on the outbound response so the browser persists
  //      it for subsequent requests.
  let lockedLocale: Locale | null = null;
  const langParam = searchParams.get('lang');
  if (langParam) {
    const normalized = langParam.toLowerCase() as Locale;
    if (locales.includes(normalized)) {
      lockedLocale = normalized;
      // Use NextResponse.next({ request }) further down so the mutated
      // request cookies are forwarded to the server render.
      request.cookies.set(LOCALE_COOKIE, normalized);
    }
  }

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
      if (!response) response = NextResponse.next({ request });
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
      if (!response) response = NextResponse.next({ request });
      response.cookies.set('preferred_state', upper, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  // Apply the locale cookie to whichever response we end up returning.
  if (lockedLocale) {
    if (!response) response = NextResponse.next({ request });
    setLocaleCookie(response, lockedLocale);
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
  // Forward the locale choice (and any UTM/state cookies we already set)
  // through the geo redirect so the Spanish landing experience survives
  // the bounce from `/` to `/states/<slug>`.
  if (lockedLocale) setLocaleCookie(redirectResponse, lockedLocale);
  return redirectResponse;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
