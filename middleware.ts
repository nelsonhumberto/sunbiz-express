import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { stripDefaultLocalePrefix, stripSpanishPrefix } from '@/i18n/config';
import {
  LOCALE_HEADER,
  localeFromPublicPath,
  localeQueryRedirect,
  PUBLIC_PATH_HEADER,
} from '@/lib/locale-paths';
import { retiredStateDestination } from '@/lib/retired-state-redirects';
import { UTM_COOKIE, UTM_MAX_AGE, mergeAttribution, parseUtmJson, utmFromSearchParams } from '@/lib/utm';

const ACTIVE_FORMATION_STATES = new Set(['FL', 'WY', 'DE']);

/**
 * Preference + attribution-aware routing middleware.
 *
 * Behavior:
 *   - On every request:
 *       • Locale comes from the path. `/es` and `/es/<path>` are Spanish.
 *         Every other path is English. next-intl localeDetection is off, so
 *         the NEXT_LOCALE cookie and Accept-Language are ignored. Prefetching
 *         an `/es` link must not switch later English URLs, including
 *         `/business-services/thank-you`. The language toggle is the only
 *         writer of NEXT_LOCALE.
 *       • `?lang=es` on an English path redirects to the `/es` path.
 *         `?lang=en` on a Spanish path redirects to the English path.
 *         The redirect does not set a locale cookie.
 *       • `/es` and `/es/<path>` rewrite to the unprefixed route with the
 *         Spanish locale, so ad URLs like `/es/business-services` render
 *         instead of 404ing.
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

  // English is unprefixed. A leftover /en or /en/* link 308s to that path
  // and keeps the query string. /enterprise and /en-us are not prefixes.
  const unprefixed = stripDefaultLocalePrefix(pathname);
  if (unprefixed) {
    const url = request.nextUrl.clone();
    url.pathname = unprefixed;
    return NextResponse.redirect(url, 308);
  }

  // Delaware and Wyoming marketing URLs 308 to the Florida equivalent.
  // next.config.js lists the same rules; this catches mixed-case paths.
  const retiredTo = retiredStateDestination(pathname);
  if (retiredTo) {
    const url = request.nextUrl.clone();
    url.pathname = retiredTo;
    return NextResponse.redirect(url, 308);
  }

  // `?lang=` moves onto the path. This response does not set NEXT_LOCALE.
  const localeJump = localeQueryRedirect(pathname, searchParams);
  if (localeJump) {
    const url = request.nextUrl.clone();
    url.pathname = localeJump.pathname;
    url.search = localeJump.search ? `?${localeJump.search}` : '';
    return NextResponse.redirect(url, 308);
  }

  const strippedPath = stripSpanishPrefix(pathname);
  const appPath = strippedPath ?? pathname;

  // Bare /wizard (and /es/wizard) is not a filing. Send visitors to /start
  // before the wizard layout asks them to sign in. Keep /es so Spanish
  // visitors are not dropped onto the English start page.
  if (appPath === '/wizard') {
    const url = request.nextUrl.clone();
    url.pathname = localeFromPublicPath(pathname) === 'es' ? '/es/start' : '/start';
    return NextResponse.redirect(url, 308);
  }
  // Forward the public path into this render. `headers()` in the root layout
  // reads `x-lf-pathname` so the ad landing page can omit the rest of the
  // translation catalog. Locale is the path, never the NEXT_LOCALE cookie
  // (routing.localeDetection is false).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-lf-pathname', appPath);
  // Original browser path (keeps /es) so canonicals and html lang follow the URL.
  requestHeaders.set(PUBLIC_PATH_HEADER, pathname);
  // routing.localeDetection is false: do not read NEXT_LOCALE.
  const effectiveLocale = localeFromPublicPath(pathname);
  requestHeaders.set(
    LOCALE_HEADER,
    effectiveLocale === 'es' ? 'es' : routing.defaultLocale,
  );
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

  // No geo-redirect: every visitor lands on the homepage (or whatever path
  // they requested). State preference is honored via the StateSwitcher
  // dropdown + `preferred_state` cookie.
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
