import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { stripDefaultLocalePrefix, stripSpanishPrefix } from '@/i18n/config';
import {
  LOCALE_HEADER,
  englishPathname,
  localeFromPublicPath,
  localeQueryRedirect,
  localizedPublicRedirect,
  PUBLIC_PATH_HEADER,
} from '@/lib/locale-paths';
import { browserPathFromAction } from '@/lib/request-locale';
import { retiredStateDestination } from '@/lib/retired-state-redirects';
import { INTERNAL_TRAFFIC_HEADER, internalTrafficQueryRequested } from '@/lib/internal-traffic';
import { UTM_COOKIE, UTM_MAX_AGE, mergeAttribution, parseUtmJson, utmFromSearchParams } from '@/lib/utm';
import {
  AD_OPT_OUT_COOKIE,
  AD_OPT_OUT_GPC_VALUE,
  adOptOutCookieSecure,
  gpcCookieDecision,
} from '@/lib/ad-opt-out';

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

  // GPC opts this response out of ad tags via the request header. It does not
  // write the 1-year lf_ad_optout=1 cookie. A GPC-only visit may set the
  // session marker lf_ad_optout=gpc, which a later request without Sec-GPC clears.
  // An explicit lf_ad_optout=1 choice is left alone.
  const withGpcOptOut = (response: NextResponse): NextResponse => {
    const gpc = request.headers.get('sec-gpc') === '1';
    const existing = request.cookies.get(AD_OPT_OUT_COOKIE)?.value ?? null;
    const decision = gpcCookieDecision(existing, gpc);
    if (decision === 'set-gpc') {
      response.cookies.set(AD_OPT_OUT_COOKIE, AD_OPT_OUT_GPC_VALUE, {
        path: '/',
        sameSite: 'lax',
        secure: adOptOutCookieSecure(),
        httpOnly: false,
      });
    } else if (decision === 'clear') {
      response.cookies.set(AD_OPT_OUT_COOKIE, '', {
        path: '/',
        sameSite: 'lax',
        maxAge: 0,
        secure: adOptOutCookieSecure(),
        httpOnly: false,
      });
    }
    return response;
  };

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
      return withGpcOptOut(NextResponse.redirect(target, { status: 308 }));
    }
  }

  // English is unprefixed. A leftover /en or /en/* link 308s to that path
  // and keeps the query string. /enterprise and /en-us are not prefixes.
  const unprefixed = stripDefaultLocalePrefix(pathname);
  if (unprefixed) {
    const url = request.nextUrl.clone();
    url.pathname = unprefixed;
    return withGpcOptOut(NextResponse.redirect(url, 308));
  }

  // Delaware and Wyoming marketing URLs 308 to the Florida equivalent.
  // next.config.js lists the same rules; this catches mixed-case paths.
  const retiredTo = retiredStateDestination(pathname);
  if (retiredTo) {
    const url = request.nextUrl.clone();
    url.pathname = retiredTo;
    return withGpcOptOut(NextResponse.redirect(url, 308));
  }

  // Localized slugs (`/contact` vs `/es/contacto`). Non-canonical URLs 308
  // before the /es rewrite, so `/contacto` does not loop back on itself.
  const slugTo = localizedPublicRedirect(pathname);
  if (slugTo) {
    const url = request.nextUrl.clone();
    url.pathname = slugTo;
    return withGpcOptOut(NextResponse.redirect(url, 308));
  }

  // `?lang=` moves onto the path. This response does not set NEXT_LOCALE.
  const localeJump = localeQueryRedirect(pathname, searchParams);
  if (localeJump) {
    const url = request.nextUrl.clone();
    url.pathname = localeJump.pathname;
    url.search = localeJump.search ? `?${localeJump.search}` : '';
    return withGpcOptOut(NextResponse.redirect(url, 308));
  }

  const strippedPath = stripSpanishPrefix(pathname);
  // `/es/contacto` rewrites to the `/contact` page. Other /es URLs drop the prefix.
  const appPath = strippedPath == null ? pathname : englishPathname(pathname);

  // Server actions POST to the rewritten path (`/start`, `/wizard/...`).
  // The browser address is the Referer or next-url. That path wins over the
  // rewrite, the NEXT_LOCALE cookie, and Accept-Language. A normal document
  // request ignores Referer so the previous page cannot change this URL.
  const actionPath = request.headers.get('next-action')
    ? browserPathFromAction({
        referer: request.headers.get('referer'),
        nextUrl: request.headers.get('next-url'),
        allowedHost: request.headers.get('host'),
      })
    : null;
  const pathnameForLocale = actionPath ?? pathname;

  // Bare /wizard (and /es/wizard) is not a filing. Send visitors to /start
  // before the wizard layout asks them to sign in. Keep /es so Spanish
  // visitors are not dropped onto the English start page.
  if (appPath === '/wizard') {
    const url = request.nextUrl.clone();
    url.pathname = localeFromPublicPath(pathname) === 'es' ? '/es/start' : '/start';
    return withGpcOptOut(NextResponse.redirect(url, 308));
  }
  // Forward the public path into this render. `headers()` in the root layout
  // reads `x-lf-pathname` so the ad landing page can omit the rest of the
  // translation catalog. Locale is the path, never the NEXT_LOCALE cookie
  // (routing.localeDetection is false).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-lf-pathname', appPath);
  // Original browser path (keeps /es) so canonicals and html lang follow the URL.
  requestHeaders.set(PUBLIC_PATH_HEADER, pathnameForLocale);
  // routing.localeDetection is false: do not read NEXT_LOCALE or Accept-Language.
  const effectiveLocale = localeFromPublicPath(pathnameForLocale);
  requestHeaders.set(
    LOCALE_HEADER,
    effectiveLocale === 'es' ? 'es' : routing.defaultLocale,
  );
  if (internalTrafficQueryRequested(request.nextUrl.search)) {
    requestHeaders.set(INTERNAL_TRAFFIC_HEADER, '1');
  }
  const requestInit = { request: { headers: requestHeaders } };

  let response: NextResponse;
  if (strippedPath) {
    const url = request.nextUrl.clone();
    url.pathname = appPath;
    response = NextResponse.rewrite(url, requestInit);
  } else {
    response = NextResponse.next(requestInit);
  }

  // Capture UTMs plus the Google click ID (`gclid`) into one JSON cookie so
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
  return withGpcOptOut(response);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
