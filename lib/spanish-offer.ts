import { routing } from '@/i18n/routing';

export const VER_EN_ESPANOL = 'Ver en español';

/**
 * Primary language subtag of navigator.languages[0].
 * `es` and `es-MX` match. `en`, `en-US`, and a later `es` in the list do not.
 */
export function browserLanguageIsSpanish(
  languages: readonly string[] | null | undefined,
): boolean {
  const first = languages?.[0]?.trim().toLowerCase() ?? '';
  if (!first) return false;
  const primary = first.split(/[-_]/)[0] ?? '';
  return primary === 'es';
}

function barePath(pathname: string): string {
  const path = (pathname.split('?')[0] ?? pathname).split('#')[0] || '/';
  const trimmed =
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function withSearch(path: string, search: string): string {
  if (!search || search === '?') return path;
  return `${path}${search.startsWith('?') ? search : `?${search}`}`;
}

/** Spanish URL for the English Florida LLC ad landing, from the routing table. */
export function floridaLlcSpanishPath(): string | null {
  const entry = routing.pathnames['/lp/florida-llc'];
  if (!entry || typeof entry === 'string') return null;
  if (entry.en !== '/lp/florida-llc') return null;
  const slug = entry.es?.startsWith('/')
    ? entry.es
    : entry.es
      ? `/${entry.es}`
      : '';
  if (!slug.startsWith('/lp/') || slug === entry.en) return null;
  return `/es${slug}`;
}

const WIZARD_STEP = /^\/wizard\/[^/]+\/[1-9]\d*$/;

/**
 * Matching Spanish URL for an English page, or null when that route is not one
 * we ship. Keeps the current query (tier, attribution) and adds nothing.
 */
export function spanishOfferHref(pathname: string, search = ''): string | null {
  const path = barePath(pathname);
  if (path === '/lp/florida-llc') {
    const spanish = floridaLlcSpanishPath();
    return spanish ? withSearch(spanish, search) : null;
  }
  if (WIZARD_STEP.test(path)) return withSearch(`/es${path}`, search);
  return null;
}

export function spanishOfferFor(input: {
  pathname: string;
  search?: string;
  languages: readonly string[] | null | undefined;
}): { href: string; label: typeof VER_EN_ESPANOL } | null {
  if (!browserLanguageIsSpanish(input.languages)) return null;
  const href = spanishOfferHref(input.pathname, input.search ?? '');
  if (!href) return null;
  return { href, label: VER_EN_ESPANOL };
}
