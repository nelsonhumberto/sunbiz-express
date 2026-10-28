import { englishPathname } from '@/lib/locale-paths';

/**
 * Paths that show customer, payment, or auth data. Matching ignores the
 * query string, hash, and a trailing slash, and treats `/es/...` the same
 * as the English path (middleware rewrites Spanish URLs onto these routes).
 *
 * Prefixes block the page itself and everything under it. Exact paths block
 * only that page.
 */
export const SESSION_REPLAY_BLOCKED_PREFIXES = [
  '/dashboard',
  '/admin',
  '/wizard',
  '/checkout',
] as const;

/**
 * Nested under the public start page only. `/start` and `/es/start` stay
 * recordable. `/starting` is not this prefix.
 */
export const SESSION_REPLAY_BLOCKED_NESTED = ['/start'] as const;

export const SESSION_REPLAY_BLOCKED_EXACT = [
  '/sign-in',
  '/sign-up',
  '/reset-password',
  '/forgot-password',
  '/login-link',
  '/resume',
] as const;

const BLOCKED_EXACT = new Set<string>(SESSION_REPLAY_BLOCKED_EXACT);

/**
 * Images and media that can show a customer's documents, signature, logo,
 * or ID. `image` is the SVG image element. rrweb replaces matches with a
 * placeholder instead of recording pixels.
 */
export const SESSION_REPLAY_BLOCKED_MEDIA = [
  'img',
  'image',
  'picture',
  'video',
  'audio',
  'canvas',
  'svg',
  'object',
  'embed',
  'iframe',
] as const;

/** posthog-js 1.373 session_recording privacy options. Local values override remote config. */
export const sessionRecordingPrivacy = {
  maskAllInputs: true,
  maskTextSelector: '*',
  blockSelector: SESSION_REPLAY_BLOCKED_MEDIA.join(', '),
} as const;

/** Pathname only: no query, no hash, no trailing slash, Spanish prefix removed. */
export function canonicalReplayPath(pathname: string): string {
  const path = englishPathname(pathname);
  if (path.length > 1) return path.replace(/\/+$/, '');
  return path || '/';
}

export function isSessionReplayBlockedPath(pathname: string): boolean {
  const path = canonicalReplayPath(pathname);
  if (BLOCKED_EXACT.has(path)) return true;
  if (
    SESSION_REPLAY_BLOCKED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  return SESSION_REPLAY_BLOCKED_NESTED.some((prefix) => path.startsWith(`${prefix}/`));
}

/**
 * Record only when every candidate path is safe. Pass the address-bar path
 * and `usePathname()` together: a Spanish URL and the rewritten pathname can
 * differ by `/es`, and either one being sensitive keeps replay off.
 */
export function sessionReplayAllowed(paths: ReadonlyArray<string | null | undefined>): boolean {
  for (const path of paths) {
    if (typeof path === 'string' && isSessionReplayBlockedPath(path)) return false;
  }
  return true;
}
