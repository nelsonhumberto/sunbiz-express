import { CLICK_ID_PARAMS, UTM_PARAMS, type AttributionParam } from '@/lib/utm';

const ATTRIBUTION_KEYS: readonly AttributionParam[] = [...UTM_PARAMS, ...CLICK_ID_PARAMS];

/** utm_* and gclid from a search string. Other params are ignored. */
export function attributionSearchParams(search: string): URLSearchParams {
  const source = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const out = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    const value = source.get(key);
    if (value) out.set(key, value);
  }
  return out;
}

/**
 * Copy utm_* and gclid onto an in-app href. Params already on the href win,
 * so a plan query (`tier`) is not replaced by the current page.
 */
export function hrefWithAttribution(href: string, search: string): string {
  const extra = attributionSearchParams(search);
  if ([...extra.keys()].length === 0) return href;
  const hashAt = href.indexOf('#');
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const withoutHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : withoutHash.slice(queryAt + 1));
  for (const [key, value] of extra) {
    if (!params.has(key)) params.set(key, value);
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ''}${hash}`;
}
