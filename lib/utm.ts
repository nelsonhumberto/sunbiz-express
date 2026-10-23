/**
 * UTM attribution helpers shared across middleware, server actions, and
 * client analytics. Keep this file free of server/client-only imports so
 * middleware can import constants safely.
 */

export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

/** Click identifiers appended by ad platforms. Kept beside UTMs in `lf_utm`. */
export const CLICK_ID_PARAMS = ['gclid', 'li_fat_id'] as const;

export type UtmParam = (typeof UTM_PARAMS)[number];
export type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];
export type AttributionParam = UtmParam | ClickIdParam;
export type UtmData = Partial<Record<AttributionParam, string>>;

export const UTM_COOKIE = 'lf_utm';
export const UTM_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const UTM_VALUE_MAX = 128;
/** `li_fat_id` is longer than a typical UTM value. */
const CLICK_ID_MAX = 512;

const ATTRIBUTION_PARAMS: readonly AttributionParam[] = [...UTM_PARAMS, ...CLICK_ID_PARAMS];

function clipAttribution(key: AttributionParam, value: string): string {
  const max = (CLICK_ID_PARAMS as readonly string[]).includes(key) ? CLICK_ID_MAX : UTM_VALUE_MAX;
  return value.trim().slice(0, max);
}

export function parseUtmJson(raw: string | undefined | null): UtmData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const out: UtmData = {};
    for (const key of ATTRIBUTION_PARAMS) {
      const val = (parsed as Record<string, unknown>)[key];
      if (typeof val === 'string' && val.trim()) out[key] = clipAttribution(key, val);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function utmFromSearchParams(
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams,
): UtmData | null {
  const out: UtmData = {};
  const read = (key: AttributionParam): string | null => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key);
    }
    const val = searchParams[key];
    if (Array.isArray(val)) return val[0] ?? null;
    return val ?? null;
  };
  for (const key of ATTRIBUTION_PARAMS) {
    const val = read(key);
    if (val?.trim()) out[key] = clipAttribution(key, val);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Last-touch UTMs replace the previous utm_* keys. Click IDs overlay: a later
 * URL without `gclid` / `li_fat_id` keeps the ones already stored, and a new
 * click ID replaces only that key.
 */
export function mergeAttribution(existing: UtmData | null, incoming: UtmData): UtmData {
  const next: UtmData = { ...(existing ?? {}) };
  const hasUtm = UTM_PARAMS.some((key) => incoming[key]);
  if (hasUtm) {
    for (const key of UTM_PARAMS) delete next[key];
    for (const key of UTM_PARAMS) {
      if (incoming[key]) next[key] = incoming[key];
    }
  }
  for (const key of CLICK_ID_PARAMS) {
    if (incoming[key]) next[key] = incoming[key];
  }
  return next;
}

/** Serialize Next.js searchParams into a query string, preserving all keys. */
export function searchParamsToQueryString(
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  if (!searchParams) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else {
      params.set(key, value);
    }
  }
  return params.toString();
}

export function utmToPrismaFields(utm: UtmData | null | undefined) {
  if (!utm) return {};
  return {
    utmSource: utm.utm_source ?? null,
    utmMedium: utm.utm_medium ?? null,
    utmCampaign: utm.utm_campaign ?? null,
    utmContent: utm.utm_content ?? null,
    utmTerm: utm.utm_term ?? null,
    gclid: utm.gclid ?? null,
    liFatId: utm.li_fat_id ?? null,
  };
}

export function utmToAnalyticsProps(utm: UtmData | null | undefined) {
  if (!utm) return {};
  return {
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    utm_term: utm.utm_term,
    gclid: utm.gclid,
    li_fat_id: utm.li_fat_id,
  };
}

/** Drop empty attribution keys so they are not registered over real values. */
export function definedAttributionProps(
  search: string | URLSearchParams,
  cookieHeader: string,
): Record<string, string> {
  const params = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const fromUrl = utmFromSearchParams(params);
  const fromCookie = readUtmCookieValue(cookieHeader);
  const merged =
    fromUrl && fromCookie ? mergeAttribution(fromCookie, fromUrl) : (fromUrl ?? fromCookie);
  const raw = utmToAnalyticsProps(merged);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

/** Read `lf_utm` from a raw document.cookie string (client-safe). */
export function readUtmCookieValue(cookieHeader: string): UtmData | null {
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${UTM_COOKIE}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(UTM_COOKIE.length + 1));
  return parseUtmJson(raw);
}
