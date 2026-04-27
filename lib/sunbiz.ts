// Florida Sunbiz name-availability lookup.
//
// Phase 1 strategy (per docs/plan): the live search.sunbiz.org site is gated
// by Cloudflare and cannot be scraped from a plain serverless fetch. Instead,
// we call the third-party sunbizdaily.com JSON API which mirrors Sunbiz's
// daily bulk feeds. The scrape path is kept available below
// (`searchSunbizScrape`) so Phase 2 (live ground-truth check at filing time)
// can opt into it via a CF-bypass proxy.
//
// Resolution order in `searchSunbiz()`:
//   1. SUNBIZDAILY_API_KEY set → call sunbizdaily.com API   (recommended)
//   2. SUNBIZ_SCRAPER_PROXY set → scrape via CF-bypass proxy (filing-time use)
//   3. Otherwise               → direct scrape (will hit Cloudflare; clear error)
//
// All failure modes return a typed `SunbizError` — never a silent empty list.

import * as cheerio from 'cheerio';
import { normalizeDistinguishableName, stripSuffix } from './florida';

export interface SunbizEntity {
  name: string;
  documentNumber: string;
  /** Display status, e.g. "Active", "INACT", "NAME HS", "CROSS RF". */
  status: string;
  detailUrl?: string;
}

export interface NameCheckResult {
  query: string;
  available: boolean;
  status: 'available' | 'exact_conflict' | 'similar_conflict' | 'restricted';
  message: string;
  conflicts: SunbizEntity[];
  suggestions: string[];
  /** Which upstream answered: 'sunbizdaily' for API, 'scrape' for direct/proxy. */
  source?: 'sunbizdaily' | 'scrape';
}

export class SunbizError extends Error {
  constructor(
    public readonly code:
      | 'cloudflare'
      | 'http'
      | 'timeout'
      | 'parse'
      | 'auth'
      | 'rate_limit'
      | 'not_configured'
      | 'unknown',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SunbizError';
  }
}

// Status classification per the Florida Sunbiz FAQ (faq-answer1):
//   - ACTIVE / NAME HS         → name is unavailable (definitive conflict)
//   - INACT (could be UA or plain INACTIVE) → ambiguous; we cannot tell from
//     sunbizdaily whether the holding period (1yr admin / 120d voluntary) has
//     expired, so we treat it as a soft warning rather than a hard block.
//   - CROSS RF                 → cross-reference of another filing; warn only
//   - W (Withdrawn) / M (Merged) → ignore (released back to the pool)
const HARD_BLOCK_STATUSES = new Set(['ACTIVE', 'NAME HS']);
const SOFT_WARN_STATUSES = new Set(['INACT', 'CROSS RF']);

const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_LIMIT = 25;
const MAX_QUERY_LEN = 100;

// ─── sunbizdaily.com API client (primary source) ─────────────────────────

// Use the canonical www. host to avoid an apex→www 301 on every request.
const SUNBIZDAILY_BASE_URL = 'https://www.sunbizdaily.com/api/v1';
const SUNBIZDAILY_WEB_ORIGIN = 'https://www.sunbizdaily.com';

interface SunbizDailyFiling {
  corporation_number: string;
  corporation_name: string;
  filing_type?: string;
  filing_type_display?: string;
  /** Single-char status code from the bulk feed. "A" = Active. */
  status?: string;
  file_date?: string;
  source_date?: string;
  city?: string;
  state?: string;
  zip?: string;
  industries?: string[];
  url?: string;
}

interface SunbizDailyListResponse {
  filings: SunbizDailyFiling[];
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
  error?: string;
  detail?: string;
}

/**
 * Map sunbizdaily's single-char status code to the display string we use
 * elsewhere. The bulk feed uses the codes documented by the FL DOS:
 *   A = Active, I = Inactive (admin dissolved), N = Name History,
 *   X = Cross Reference, W = Withdrawn, M = Merged.
 * Unknown codes pass through unchanged so we never lose information.
 */
function absolutizeSunbizDailyUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, SUNBIZDAILY_WEB_ORIGIN).toString();
  } catch {
    return undefined;
  }
}

function mapSunbizDailyStatus(code: string | undefined): string {
  switch ((code ?? '').toUpperCase()) {
    case 'A':
      return 'Active';
    case 'I':
      return 'INACT';
    case 'N':
      return 'NAME HS';
    case 'X':
      return 'CROSS RF';
    case 'W':
      return 'Withdrawn';
    case 'M':
      return 'Merged';
    case '':
      return 'Unknown';
    default:
      return code!.toUpperCase();
  }
}

async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onAbort);
  }
}

async function searchSunbizDaily(
  query: string,
  apiKey: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<SunbizEntity[]> {
  const term = query.trim().slice(0, MAX_QUERY_LEN);
  if (!term) return [];
  const perPage = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 100));

  const url = new URL(`${SUNBIZDAILY_BASE_URL}/filings/`);
  url.searchParams.set('corporation_name', term);
  url.searchParams.set('state', 'FL');
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('sort', 'corporation_name');
  url.searchParams.set('order', 'asc');
  // Search across all-time records, not just last 7d.
  url.searchParams.set('period', 'all');

  return withTimeout(async (signal) => {
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'IncServices/1.0 (+name-availability)',
        },
        signal,
        cache: 'no-store',
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new SunbizError('timeout', 'sunbizdaily request timed out');
      }
      throw new SunbizError(
        'unknown',
        `sunbizdaily request failed: ${(err as Error)?.message ?? String(err)}`,
        err,
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new SunbizError(
        'auth',
        'sunbizdaily rejected the API key (401/403). Check SUNBIZDAILY_API_KEY.',
      );
    }
    if (res.status === 429) {
      throw new SunbizError(
        'rate_limit',
        'sunbizdaily rate limit exceeded (1,000 req/hr). Try again shortly.',
      );
    }
    if (!res.ok) {
      throw new SunbizError(
        'http',
        `sunbizdaily returned HTTP ${res.status}`,
      );
    }

    let body: SunbizDailyListResponse;
    try {
      body = (await res.json()) as SunbizDailyListResponse;
    } catch (err) {
      throw new SunbizError('parse', 'sunbizdaily returned non-JSON response', err);
    }

    if (!body || !Array.isArray(body.filings)) {
      throw new SunbizError(
        'parse',
        `sunbizdaily response missing 'filings' array${body?.error ? `: ${body.error}` : ''}`,
      );
    }

    return body.filings.map<SunbizEntity>((f) => ({
      name: f.corporation_name,
      documentNumber: f.corporation_number,
      status: mapSunbizDailyStatus(f.status),
      detailUrl: absolutizeSunbizDailyUrl(f.url),
    }));
  }, opts.signal);
}

// ─── Direct scrape (fallback / Phase-2 live ground-truth path) ───────────

const SUNBIZ_SEARCH_URL =
  'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function buildScrapeUrl(query: string): string {
  const url = new URL(SUNBIZ_SEARCH_URL);
  url.searchParams.set('inquiryType', 'EntityName');
  url.searchParams.set('searchNameOrder', query.toUpperCase());
  url.searchParams.set('searchTerm', query);
  return url.toString();
}

function looksLikeCloudflareChallenge(html: string): boolean {
  if (!html) return false;
  return (
    html.includes('Just a moment') ||
    html.includes('challenges.cloudflare.com') ||
    html.includes('cf-browser-verification') ||
    html.includes('cf-mitigated')
  );
}

async function fetchScrapeDirect(url: string, signal?: AbortSignal): Promise<string> {
  return withTimeout(async (s) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: BROWSER_HEADERS,
        redirect: 'follow',
        signal: s,
        cache: 'no-store',
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new SunbizError('timeout', 'Sunbiz scrape timed out');
      }
      throw new SunbizError(
        'unknown',
        `Sunbiz scrape failed: ${(err as Error)?.message ?? String(err)}`,
        err,
      );
    }
    const body = await res.text().catch(() => '');
    if (!res.ok) {
      if (looksLikeCloudflareChallenge(body)) {
        throw new SunbizError(
          'cloudflare',
          `Sunbiz blocked by Cloudflare (HTTP ${res.status}). ` +
            'Set SUNBIZDAILY_API_KEY or SUNBIZ_SCRAPER_PROXY.',
        );
      }
      throw new SunbizError('http', `Sunbiz returned HTTP ${res.status}`);
    }
    return body;
  }, signal);
}

function buildProxyUrl(target: string, proxyTemplate: string): string {
  if (proxyTemplate.includes('{url}')) {
    return proxyTemplate.replace('{url}', encodeURIComponent(target));
  }
  let u: URL;
  try {
    u = new URL(proxyTemplate);
  } catch {
    throw new SunbizError(
      'unknown',
      `Invalid SUNBIZ_SCRAPER_PROXY value: "${proxyTemplate}"`,
    );
  }
  u.searchParams.set('url', target);
  return u.toString();
}

async function fetchScrapeViaProxy(
  target: string,
  proxyTemplate: string,
  signal?: AbortSignal,
): Promise<string> {
  const proxied = buildProxyUrl(target, proxyTemplate);
  return withTimeout(async (s) => {
    let res: Response;
    try {
      res = await fetch(proxied, {
        method: 'GET',
        redirect: 'follow',
        signal: s,
        cache: 'no-store',
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new SunbizError('timeout', 'Sunbiz proxy request timed out');
      }
      throw new SunbizError(
        'unknown',
        `Sunbiz proxy request failed: ${(err as Error)?.message ?? String(err)}`,
        err,
      );
    }
    if (!res.ok) {
      throw new SunbizError('http', `Sunbiz proxy returned HTTP ${res.status}`);
    }
    return await res.text();
  }, signal);
}

function parseScrapeResults(html: string, limit: number): SunbizEntity[] {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch (err) {
    throw new SunbizError('parse', 'Failed to parse Sunbiz HTML', err);
  }

  const tds = $('td').toArray();
  const out: SunbizEntity[] = [];
  const seen = new Set<string>();

  // Each result row is `<tr><td><a>name</a></td><td>doc#</td><td>status</td></tr>`,
  // so the cell two positions after a link is the status (matches the original
  // Python heuristic in sunbiz_scraper.py).
  for (let i = 0; i < tds.length && out.length < limit; i++) {
    const $td = $(tds[i]);
    const link = $td.find('a').first();
    if (link.length === 0) continue;

    const name = link.text().trim();
    if (!name) continue;

    const docTd = tds[i + 1];
    const statusTd = tds[i + 2];
    if (!docTd || !statusTd) continue;

    const documentNumber = $(docTd).text().trim();
    const status = $(statusTd).text().trim();
    if (!documentNumber || !status) continue;
    if (seen.has(documentNumber)) continue;
    seen.add(documentNumber);

    let detailUrl: string | undefined;
    const href = link.attr('href');
    if (href) {
      try {
        detailUrl = new URL(href, 'https://search.sunbiz.org').toString();
      } catch {
        // ignore malformed hrefs
      }
    }

    out.push({ name, documentNumber, status, detailUrl });
  }

  return out;
}

/**
 * Lower-level scrape — exposed for the Phase-2 live ground-truth check at
 * filing time. Routes through `SUNBIZ_SCRAPER_PROXY` if set, otherwise hits
 * the live site directly (which will usually fail with a Cloudflare error
 * from a serverless host).
 */
export async function searchSunbizScrape(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<SunbizEntity[]> {
  const term = query.trim().slice(0, MAX_QUERY_LEN);
  if (!term) return [];
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 100));
  const url = buildScrapeUrl(term);

  const proxy = process.env.SUNBIZ_SCRAPER_PROXY?.trim();
  const html = proxy
    ? await fetchScrapeViaProxy(url, proxy, opts.signal)
    : await fetchScrapeDirect(url, opts.signal);

  if (looksLikeCloudflareChallenge(html)) {
    throw new SunbizError(
      'cloudflare',
      'Sunbiz returned a Cloudflare challenge page. ' +
        'Set SUNBIZDAILY_API_KEY or SUNBIZ_SCRAPER_PROXY.',
    );
  }

  return parseScrapeResults(html, limit);
}

// ─── Public API ──────────────────────────────────────────────────────────

interface SearchOptions {
  limit?: number;
  signal?: AbortSignal;
  /**
   * Force a particular upstream. Defaults to 'auto' which prefers the
   * sunbizdaily.com API and falls back to the scraper.
   */
  source?: 'auto' | 'sunbizdaily' | 'scrape';
}

interface SearchResult {
  entities: SunbizEntity[];
  source: 'sunbizdaily' | 'scrape';
}

export async function searchSunbiz(
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const apiKey = process.env.SUNBIZDAILY_API_KEY?.trim();
  const proxy = process.env.SUNBIZ_SCRAPER_PROXY?.trim();
  const source = opts.source ?? 'auto';

  if (source === 'sunbizdaily' || (source === 'auto' && apiKey)) {
    if (!apiKey) {
      throw new SunbizError(
        'not_configured',
        'sunbizdaily source requested but SUNBIZDAILY_API_KEY is not set.',
      );
    }
    const entities = await searchSunbizDaily(query, apiKey, {
      limit: opts.limit,
      signal: opts.signal,
    });
    return { entities, source: 'sunbizdaily' };
  }

  if (source === 'scrape' || source === 'auto') {
    if (source === 'auto' && !apiKey && !proxy) {
      // Be explicit: neither path is configured. Fail fast with guidance.
      throw new SunbizError(
        'not_configured',
        'No Sunbiz data source is configured. Set SUNBIZDAILY_API_KEY (preferred) ' +
          'or SUNBIZ_SCRAPER_PROXY before calling.',
      );
    }
    const entities = await searchSunbizScrape(query, {
      limit: opts.limit,
      signal: opts.signal,
    });
    return { entities, source: 'scrape' };
  }

  throw new SunbizError('unknown', `Unknown source: ${source}`);
}

/**
 * Higher-level availability check that classifies the live Sunbiz results
 * against Florida's "distinguishable upon the record" rule.
 *
 * Comparison uses `normalizeDistinguishableName()` from `lib/florida.ts`,
 * which strips entity suffixes, articles ("the"/"a"/"an"), `and`/`&`,
 * punctuation/symbols, and singular/plural/possessive forms — matching the
 * Division's published rules.
 *
 * To improve recall we run multiple search terms (the raw query and its
 * suffix-stripped base) and de-duplicate by document number, since
 * sunbizdaily's prefix-style search may miss filings with extra leading
 * articles or different suffix forms.
 */
export async function checkNameAvailability(
  query: string,
  entityType: 'LLC' | 'CORP',
  opts: SearchOptions = {},
): Promise<NameCheckResult> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return {
      query,
      available: false,
      status: 'available',
      message: 'Enter at least 2 characters to check availability.',
      conflicts: [],
      suggestions: [],
    };
  }

  const targetNorm = normalizeDistinguishableName(trimmed);
  // Build a small set of search terms to widen recall without spamming the API.
  const searchTerms = uniq([
    trimmed,
    stripSuffix(trimmed),
    targetNorm,
  ]).filter((t) => t.length >= 2);

  let mergedSource: 'sunbizdaily' | 'scrape' | undefined;
  const seen = new Set<string>();
  const allEntities: SunbizEntity[] = [];

  for (const term of searchTerms) {
    let res;
    try {
      res = await searchSunbiz(term, opts);
    } catch (err) {
      // If any term fails, propagate — caller maps to user-facing error.
      throw err;
    }
    mergedSource = mergedSource ?? res.source;
    for (const e of res.entities) {
      if (!e.documentNumber || seen.has(e.documentNumber)) continue;
      seen.add(e.documentNumber);
      allEntities.push(e);
    }
  }

  const hardConflicts: SunbizEntity[] = [];
  const softConflicts: SunbizEntity[] = [];

  for (const e of allEntities) {
    const status = e.status.toUpperCase();
    const isHard = HARD_BLOCK_STATUSES.has(status);
    const isSoft = SOFT_WARN_STATUSES.has(status);
    if (!isHard && !isSoft) continue; // ignore Withdrawn/Merged/Unknown

    const eNorm = normalizeDistinguishableName(e.name);
    if (!eNorm) continue;

    const isMatch =
      eNorm === targetNorm ||
      eNorm.includes(targetNorm) ||
      targetNorm.includes(eNorm);
    if (!isMatch) continue;

    if (isHard && eNorm === targetNorm) {
      hardConflicts.push(e);
    } else {
      softConflicts.push(e);
    }
  }

  if (hardConflicts.length > 0) {
    return {
      query,
      available: false,
      status: 'exact_conflict',
      message:
        'A Florida entity with this name is already on the record. Florida requires names "distinguishable upon the record" — try a more distinct name.',
      conflicts: hardConflicts.slice(0, 5),
      suggestions: generateSuggestions(trimmed, entityType),
      source: mergedSource,
    };
  }

  if (softConflicts.length > 0) {
    return {
      query,
      available: false,
      status: 'similar_conflict',
      message:
        'We found similar Florida filings (some are inactive or cross-references and may still be held). Florida requires names "distinguishable upon the record" — try a more distinct variation.',
      conflicts: softConflicts.slice(0, 5),
      suggestions: generateSuggestions(trimmed, entityType),
      source: mergedSource,
    };
  }

  return {
    query,
    available: true,
    status: 'available',
    message:
      'No conflicts found in the Florida Sunbiz registry. A final state check will run at filing.',
    conflicts: [],
    suggestions: [],
    source: mergedSource,
  };
}

function uniq<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of arr) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function generateSuggestions(query: string, entityType: 'LLC' | 'CORP'): string[] {
  const stripped = stripSuffix(query);
  const base = stripped
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const suffix = entityType === 'LLC' ? 'LLC' : 'Inc';
  return [
    `${base} Group ${suffix}`,
    `${base} Holdings ${suffix}`,
    `${base} & Co ${suffix}`,
    `The ${base} ${suffix}`,
  ];
}
