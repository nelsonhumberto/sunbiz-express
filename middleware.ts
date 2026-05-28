import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, locales, type Locale } from '@/i18n/config';
import { UTM_COOKIE, UTM_MAX_AGE, UTM_PARAMS } from '@/lib/utm';

const ACTIVE_FORMATION_STATES = new Set(['FL', 'WY', 'DE']);

/**
 * Preference + attribution-aware routing middleware.
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
 *
 * Note (post-audit, May 2026): geo-based auto-redirect from `/` to
 * `/states/<region-slug>` was REMOVED. The previous behavior diverted
 * non-FL visitors to coming-soon state pages (e.g. `/states/massachusetts`)
 * with no Start CTA, costing conversions. Visitors now always see the FL
 * marketing homepage, which is multi-state-aware via the StateSwitcher.
 */
const LOCALE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setLocaleCookie(res: NextResponse, locale: Locale) {
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: LOCALE_MAX_AGE,
  });
}

/**
 * Canonical hosts that the app should serve from. Any other production
 * host (e.g. the legacy `sunbiz-express.vercel.app` preview URL the May
 * 2026 audit flagged) is 301'd to the canonical apex. Set via
 * `LF_CANONICAL_HOSTS` — a comma-separated list of host names without
 * protocol. Leaving it empty disables host redirection (useful for
 * local dev / Vercel preview deploys).
 */
const CANONICAL_HOSTS = (process.env.LF_CANONICAL_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const PRIMARY_CANONICAL_HOST = CANONICAL_HOSTS[0];

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // ── Canonical host enforcement ─────────────────────────────────────────
  // Forward any request landing on a non-canonical host (the old
  // sunbiz-express.vercel.app checkout host, raw preview URLs, etc.) to
  // the canonical apex so analytics, security cookies, and SEO all stay
  // consistent.
  if (PRIMARY_CANONICAL_HOST) {
    const requestHost = request.headers.get('host')?.toLowerCase() ?? '';
    const requestHostname = requestHost.split(':')[0];
    if (
      requestHostname &&
      // Allow localhost / *.local / 127.0.0.1 so dev never gets redirected.
      !requestHostname.startsWith('localhost') &&
      !requestHostname.endsWith('.local') &&
      requestHostname !== '127.0.0.1' &&
      !CANONICAL_HOSTS.includes(requestHostname)
    ) {
      const target = request.nextUrl.clone();
      target.host = PRIMARY_CANONICAL_HOST;
      target.protocol = 'https:';
      return NextResponse.redirect(target, { status: 308 });
    }
  }

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

  // No geo-redirect: every visitor lands on the homepage (or whatever path
  // they requested). State preference is honored via the StateSwitcher
  // dropdown + `preferred_state` cookie.
  return response ?? NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
