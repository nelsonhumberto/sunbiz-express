/**
 * Florida LLC is preselected, and wizard step 1 is skipped, for the Florida
 * LLC landing pages and for Google ad traffic. Everyone else keeps the
 * current state and entity flow.
 */

export const FLORIDA_LLC_PRESELECT_KEY = 'floridaLlcPreselected';

const LANDING_PATHS = new Set(['/lp/florida-llc', '/es/lp/llc-florida']);

export function pathnameOnly(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).pathname;
    }
  } catch {
    return '';
  }
  const path = trimmed.split('?')[0]?.split('#')[0] ?? '';
  return path.startsWith('/') ? path : '';
}

export function isFloridaLlcLandingPath(value: string | null | undefined): boolean {
  return LANDING_PATHS.has(pathnameOnly(value));
}

export function isGoogleAdsSource(source: string | null | undefined): boolean {
  return (source ?? '').trim().toLowerCase() === 'google';
}

export function shouldPreselectFloridaLlc(input: {
  path?: string | null;
  referer?: string | null;
  utmSource?: string | null;
}): boolean {
  if (isGoogleAdsSource(input.utmSource)) return true;
  if (isFloridaLlcLandingPath(input.path)) return true;
  if (isFloridaLlcLandingPath(input.referer)) return true;
  return false;
}

export function readFloridaLlcPreselected(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    return (parsed as Record<string, unknown>)[FLORIDA_LLC_PRESELECT_KEY] === true;
  } catch {
    return false;
  }
}

/** Merge the flag into optionalDetails without dropping keys the wizard already stored. */
export function optionalDetailsWithPreselect(raw?: string | null): string {
  let prev: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        prev = parsed as Record<string, unknown>;
      }
    } catch {
      prev = {};
    }
  }
  return JSON.stringify({ ...prev, [FLORIDA_LLC_PRESELECT_KEY]: true });
}
