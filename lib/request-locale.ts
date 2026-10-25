import { localeFromPublicPath } from '@/lib/locale-paths';

export type PathLocale = 'en' | 'es';

const STATIC_HOSTS = new Set(['launchforma.com', 'www.launchforma.com', 'localhost', '127.0.0.1']);

function hostAllowed(hostname: string, allowedHost?: string | null): boolean {
  const host = hostname.toLowerCase().split(':')[0] ?? '';
  if (!host) return false;
  if (STATIC_HOSTS.has(host)) return true;
  if (host.endsWith('.vercel.app') || host.endsWith('.local')) return true;
  const allowed = (allowedHost ?? '').toLowerCase().split(':')[0];
  return Boolean(allowed) && host === allowed;
}

/**
 * Path from an address bar, Referer, or next-url value.
 * Absolute URLs must be this site. A foreign host is ignored so it cannot
 * pick the language. Cookie and Accept-Language are not inputs.
 */
export function pathFromLocaleSignal(
  value: string | null | undefined,
  allowedHost?: string | null,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const path = (trimmed.split('?')[0] ?? trimmed).split('#')[0] || '/';
    if (!path.startsWith('/') || path.length > 500) return null;
    return path;
  }
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (!hostAllowed(url.hostname, allowedHost)) return null;
    const path = url.pathname || '/';
    return path.length > 500 ? null : path;
  } catch {
    return null;
  }
}

function signalPath(
  value: string | null | undefined,
  allowedHost: string | null | undefined,
  ignoreRoot: boolean,
): string | null {
  const path = pathFromLocaleSignal(value, allowedHost);
  if (!path) return null;
  // `https://launchforma.com/` is what a stripped Referer looks like.
  // It is not evidence the visitor is on the English homepage.
  if (ignoreRoot && path === '/') return null;
  return path;
}

export interface RequestLocaleInput {
  /** `window.location.pathname` from the page that submitted. */
  browserPath?: string | null;
  /** Middleware `x-lf-public-path`. */
  publicPath?: string | null;
  /** Next.js `next-url` header. May be the rewritten path. */
  nextUrl?: string | null;
  /** Browser Referer. The address bar for a same-origin server action. */
  referer?: string | null;
  /** Middleware `x-lf-locale`. Never the NEXT_LOCALE cookie. */
  localeHeader?: string | null;
  /** Host of this request, so a preview domain can match its own Referer. */
  allowedHost?: string | null;
  /**
   * Server actions lose the rewritten URL. Referer and next-url are the
   * address bar. Document requests ignore them so the previous page cannot
   * override the URL the visitor opened.
   */
  serverAction?: boolean;
}

/**
 * Locale from the URL path. The first real path wins.
 * On a server action the address bar (browser path, then Referer) beats the
 * unprefixed rewrite. NEXT_LOCALE and Accept-Language are not consulted.
 * Returns null when no path was visible, so a saved filing locale can still
 * be used for mail sent outside a request.
 */
export function resolveRequestLocale(input: RequestLocaleInput): PathLocale | null {
  const browser = signalPath(input.browserPath, input.allowedHost, false);
  if (browser) return localeFromPublicPath(browser);

  if (input.serverAction) {
    const fromBrowser =
      signalPath(input.referer, input.allowedHost, true) ??
      signalPath(input.nextUrl, input.allowedHost, true);
    if (fromBrowser) return localeFromPublicPath(fromBrowser);
  }

  const forwarded = signalPath(input.publicPath, input.allowedHost, false);
  if (forwarded) return localeFromPublicPath(forwarded);

  if (input.localeHeader === 'en' || input.localeHeader === 'es') return input.localeHeader;
  return null;
}

/**
 * Path of the page that invoked a server action, when it differs from the
 * rewritten POST url. Null when the action did not send a usable path.
 */
export function browserPathFromAction(input: {
  referer?: string | null;
  nextUrl?: string | null;
  allowedHost?: string | null;
}): string | null {
  return (
    signalPath(input.referer, input.allowedHost, true) ??
    signalPath(input.nextUrl, input.allowedHost, true)
  );
}

/**
 * A path we actually saw wins over the filing's saved locale.
 * With no path, the filing locale remains. English is the last fallback.
 */
export function localeFromPathOrFiling(
  pathLocale: string | null | undefined,
  filingLocale?: string | null,
): PathLocale {
  if (pathLocale === 'es' || pathLocale === 'en') return pathLocale;
  return filingLocale === 'es' ? 'es' : 'en';
}
