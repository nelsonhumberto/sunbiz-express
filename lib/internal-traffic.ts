/** Exact mailboxes treated as internal, besides the company domains. */
const INTERNAL_EMAILS = ['nelsonhumberto@gmail.com'] as const;

/** Exact domains. A subdomain or a lookalike host is not internal. */
const INTERNAL_DOMAINS = ['launchforma.com', 'intelepeer.ai', 'aqurio.com'] as const;

/** Cookie and localStorage flag set by `?lf_internal=1`. */
export const INTERNAL_TRAFFIC_FLAG = 'lf_internal';

const INTERNAL_UA = /HeadlessChrome|Playwright|Puppeteer|lf-qa/i;

/** Staff, company accounts, and the named partner mailboxes. */
export function isInternalTrafficUser(
  user: { role?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return isInternalEmail(user.email);
}

export function isInternalEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() ?? '';
  const at = normalized.lastIndexOf('@');
  if (at < 1 || at === normalized.length - 1) return false;
  if ((INTERNAL_EMAILS as readonly string[]).includes(normalized)) return true;
  return (INTERNAL_DOMAINS as readonly string[]).includes(normalized.slice(at + 1));
}

export function isInternalUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && INTERNAL_UA.test(userAgent));
}

export function internalTrafficQueryRequested(search: string | null | undefined): boolean {
  const raw = search ?? '';
  const query = raw.startsWith('?') ? raw.slice(1) : raw;
  return new URLSearchParams(query).get('lf_internal') === '1';
}

export function hasInternalTrafficCookie(cookie: string | null | undefined): boolean {
  return new RegExp(`(?:^|;\\s*)${INTERNAL_TRAFFIC_FLAG}=1(?:;|$)`).test(cookie ?? '');
}

/** Persistent cookie written when the URL asks to mark this browser internal. */
export function internalTrafficCookie(secure: boolean): string {
  return `${INTERNAL_TRAFFIC_FLAG}=1; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Browser signals that do not need a logged-in user: automation user agents,
 * `?lf_internal=1`, or the flag that query already stored.
 */
export function isInternalBrowserSignal(input: {
  userAgent?: string | null;
  search?: string | null;
  cookie?: string | null;
  storedFlag?: string | null;
}): boolean {
  return (
    isInternalUserAgent(input.userAgent) ||
    internalTrafficQueryRequested(input.search) ||
    input.storedFlag === '1' ||
    hasInternalTrafficCookie(input.cookie)
  );
}
