import { NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, locales, stripSpanishPrefix, type Locale } from '@/i18n/config';
import { UTM_COOKIE, UTM_MAX_AGE, mergeAttribution, parseUtmJson, utmFromSearchParams } from '@/lib/utm';

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
 *       • `/es` and `/es/<path>` rewrite to the unprefixed route with the
 *         Spanish locale, so ad URLs like `/es/business-services` render
 *         instead of 404ing. `?lang=` still wins when both are present.
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
 * `LF_CANONICAL_HOSTS` - a comma-separated list of host names without
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

  // Capture locale *first* so the server render sees it. Priority:
  //   1. Explicit `?lang=es|en` (wins - for ads and language toggle)
  //   2. Path prefix `/es` or `/es/<path>` (Spanish ad URLs)
  //   3. `utm_campaign` prefix `es-` / `en-` (so `es-fl-llc` lands in Spanish
  //      even if the marketer forgot `lang=es`)
  // We both:
  //   a. put the locale on the forwarded Cookie header so this request's
  //      server components pick it up via i18n/request.ts; and
  //   b. set the cookie on the outbound response so the browser persists
  //      it for subsequent requests (offer → /start → wizard).
  let lockedLocale: Locale | null = null;
  const langParam = searchParams.get('lang');
  if (langParam) {
    const normalized = langParam.toLowerCase() as Locale;
    if (locales.includes(normalized)) {
      lockedLocale = normalized;
    }
  } else if (stripSpanishPrefix(pathname)) {
    lockedLocale = 'es';
  } else {
    const campaign = (searchParams.get('utm_campaign') ?? '').toLowerCase();
    if (campaign.startsWith('es-') || campaign.startsWith('es_')) {
      lockedLocale = 'es';
    } else if (campaign.startsWith('en-') || campaign.startsWith('en_')) {
      lockedLocale = 'en';
    }
  }
  const strippedPath = stripSpanishPrefix(pathname);
  const appPath = strippedPath ?? pathname;
  // Forward the path and the locale cookie into this render. `headers()` in
  // the root layout reads `x-lf-pathname` so the ad landing page can omit the
  // rest of the translation catalog.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-lf-pathname', appPath);
  if (lockedLocale) {
    const existing = request.headers.get('cookie') ?? '';
    const parts = existing
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith(`${LOCALE_COOKIE}=`));
    parts.push(`${LOCALE_COOKIE}=${lockedLocale}`);
    requestHeaders.set('cookie', parts.join('; '));
  }
  const requestInit = { request: { headers: requestHeaders } };

  let response: NextResponse;
  if (strippedPath) {
    const url = request.nextUrl.clone();
    url.pathname = strippedPath;
    response = NextResponse.rewrite(url, requestInit);
  } else {
    response = NextResponse.next(requestInit);
  }

  // Capture UTMs plus click IDs (`gclid`, `li_fat_id`) into one JSON cookie so
  // attribution survives page navigations and lands on sign-up / inquiries.
  // A new UTM set replaces the previous utm_* keys (last touch). Click IDs
  // overlay, so a later URL that omits them does not wipe the ones we have.
  const incomingAttribution = utmFromSearchParams(searchParams);
  if (incomingAttribution) {
    const existing = parseUtmJson(request.cookies.get(UTM_COOKIE)?.value);
    const merged = mergeAttribution(existing, incomingAttribution);
    if (Object.keys(merged).length > 0) {
      response.cookies.set(UTM_COOKIE, JSON.stringify(merged), {
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
      response.cookies.set('preferred_state', upper, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  if (lockedLocale) {
    setLocaleCookie(response, lockedLocale);
  }

  // No geo-redirect: every visitor lands on the homepage (or whatever path
  // they requested). State preference is honored via the StateSwitcher
  // dropdown + `preferred_state` cookie.
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
