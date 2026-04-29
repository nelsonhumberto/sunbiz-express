import { NextRequest, NextResponse } from 'next/server';
import { STATE_CODE_TO_SLUG } from '@/lib/marketing-states';

/**
 * Geo-routing middleware.
 *
 * On a plain "/" hit (no explicit ?state= param) Vercel populates two headers:
 *   x-vercel-ip-country        → "US", "MX", "GB", …
 *   x-vercel-ip-country-region → US state code: "FL", "GA", "TX", …
 *
 * If the visitor is in the US but outside Florida we 302-redirect them to
 * the state-specific landing page (/states/georgia, /states/texas, …).
 * Florida visitors and non-US visitors land on the default FL homepage.
 *
 * The cookie `geo_redirected` is set after the first redirect so the user
 * can freely navigate back to "/" without being bounced again in the same
 * browser session.
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Only intercept the root homepage.
  if (pathname !== '/') return NextResponse.next();

  // Respect an explicit ?state= override — user or campaign link chose a state.
  if (searchParams.has('state')) return NextResponse.next();

  // Don't loop: if we already redirected this session, let them browse freely.
  if (request.cookies.has('geo_redirected')) return NextResponse.next();

  // Vercel sets these in production; they're absent locally so we fall through.
  const country = request.headers.get('x-vercel-ip-country') ?? '';
  const region = request.headers.get('x-vercel-ip-country-region') ?? '';

  // Non-US visitors or missing headers → default Florida homepage.
  if (country !== 'US' || !region) return NextResponse.next();

  // Florida is home — no redirect needed.
  if (region === 'FL') return NextResponse.next();

  const slug = STATE_CODE_TO_SLUG[region];

  // Unknown / unregistered territory → fall back to Florida homepage.
  if (!slug) return NextResponse.next();

  // Redirect to the dedicated state landing page.
  const target = request.nextUrl.clone();
  target.pathname = `/states/${slug}`;
  target.search = '';

  const response = NextResponse.redirect(target, { status: 302 });

  // Remember for the rest of the browser session so back-navigation works.
  response.cookies.set('geo_redirected', '1', {
    path: '/',
    sameSite: 'lax',
    // No maxAge → session cookie; cleared when the browser closes.
  });

  return response;
}

export const config = {
  /**
   * Run on every non-asset, non-API, non-Next-internal request.
   * The negative lookahead keeps static files and API routes unaffected.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon|robots|sitemap|.*\\..*).*)'],
};
