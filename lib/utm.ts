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

export type UtmParam = (typeof UTM_PARAMS)[number];
export type UtmData = Partial<Record<UtmParam, string>>;

export const UTM_COOKIE = 'lf_utm';
export const UTM_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function parseUtmJson(raw: string | undefined | null): UtmData | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const out: UtmData = {};
    for (const key of UTM_PARAMS) {
      const val = (parsed as Record<string, unknown>)[key];
      if (typeof val === 'string' && val.trim()) out[key] = val.trim().slice(0, 128);
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
  const read = (key: UtmParam): string | null => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key);
    }
    const val = searchParams[key];
    if (Array.isArray(val)) return val[0] ?? null;
    return val ?? null;
  };
  for (const key of UTM_PARAMS) {
    const val = read(key);
    if (val?.trim()) out[key] = val.trim().slice(0, 128);
  }
  return Object.keys(out).length > 0 ? out : null;
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
  };
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
