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
// All failure modes return a typed `SunbizError` - never a silent empty list.

import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linkAbortSignals } from './abort-signals';
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
      | 'not_found'
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

/**
 * Name availability must not stack one 12s timeout per search term.
 * Every term shares this budget and runs together.
 */
export const NAME_CHECK_UPSTREAM_BUDGET_MS = 5_000;
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
          'User-Agent': 'LaunchForma/1.0 (+name-availability)',
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
 * Lower-level scrape - exposed for the Phase-2 live ground-truth check at
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
 * punctuation/symbols, and singular/plural/possessive forms - matching the
 * Division's published rules.
 *
 * To improve recall we run multiple search terms (the raw query and its
 * suffix-stripped base) and de-duplicate by document number, since
 * sunbizdaily's prefix-style search may miss filings with extra leading
 * articles or different suffix forms.
 *
 * Search terms run together under one budget, so three slow lookups cannot
 * add up past NAME_CHECK_UPSTREAM_BUDGET_MS.
 */
export async function runBudgetedSearches<T>(
  terms: string[],
  opts: { signal?: AbortSignal; budgetMs?: number },
  search: (term: string, signal: AbortSignal) => Promise<T>,
): Promise<T[]> {
  const budget = AbortSignal.timeout(opts.budgetMs ?? NAME_CHECK_UPSTREAM_BUDGET_MS);
  const signal = linkAbortSignals([opts.signal, budget]);
  if (!signal) return Promise.all(terms.map((term) => search(term, budget)));
  return Promise.all(terms.map((term) => search(term, signal)));
}

export async function checkNameAvailability(
  query: string,
  entityType: 'LLC' | 'CORP',
  opts: SearchOptions = {},
): Promise<NameCheckResult> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    throw new SunbizError('unknown', 'Enter at least 2 characters to check availability.');
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

  // Parallel under one budget. A slow term used to add another 12s wait
  // after the previous term had already timed out.
  const settled = await runBudgetedSearches(searchTerms, { signal: opts.signal }, (term, signal) =>
    searchSunbiz(term, { ...opts, signal }),
  );
  for (const res of settled) {
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
        'A Florida entity with this name is already on the record. Florida requires names "distinguishable upon the record" - try a more distinct name.',
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
        'We found similar Florida filings (some are inactive or cross-references and may still be held). Florida requires names "distinguishable upon the record" - try a more distinct variation.',
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

// ─── Entity detail by document number (Sunbiz Daily API) ─────────────────

/** Shape returned by `GET /api/v1/filings/{corporation_number}/` (see sunbizdaily developers docs). */
export interface SunbizDailyAddress {
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface SunbizDailyOfficer {
  position?: number;
  name?: string;
  title?: string;
  officer_type?: string;
}

export interface FloridaAnnualReportFiling {
  year: number;
  filed_date?: string;
}

export interface FloridaEntityDetail {
  corporation_number: string;
  corporation_name: string;
  filing_type?: string;
  filing_type_display?: string;
  status?: string;
  file_date?: string;
  source_date?: string;
  fei_number?: string;
  principal_address?: SunbizDailyAddress | null;
  mailing_address?: SunbizDailyAddress | null;
  registered_agent?: {
    name?: string;
    agent_type?: string;
    address?: SunbizDailyAddress | null;
  } | null;
  officers?: SunbizDailyOfficer[];
  industries?: { label?: string; is_primary?: boolean }[];
  /**
   * Years present on the Sunbiz annual report table.
   * Absent means the source did not include the table.
   * An empty array means the table was present and had no years.
   */
  annual_reports?: FloridaAnnualReportFiling[];
  /**
   * Years an annual-report event explicitly names.
   * This is evidence a year was filed. It is not a complete table.
   */
  event_filed_years?: number[];
  url?: string;
}

/**
 * Normalize pasted Florida document numbers: trim, strip invisible chars,
 * uppercase, and fix common mistake (letter O vs digit 0) in the numeric tail.
 */
export function normalizeFloridaDocumentNumber(raw: string): string {
  let s = raw
    .trim()
    .replace(/\s+/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toUpperCase();
  if (s.length >= 2) {
    const head = s[0];
    const tail = s
      .slice(1)
      .replace(/O/g, '0')
      .replace(/[^A-Z0-9]/g, '');
    s = head + tail;
  }
  return s;
}

/** Years in a Sunbiz detail page annual report table. */
export function parseFloridaAnnualReportYears(html: string): number[] {
  const years = new Set<number>();
  const row = /<td[^>]*>\s*(20\d{2})\s*<\/td>\s*<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>/gi;
  for (const match of html.matchAll(row)) {
    years.add(Number(match[1]));
  }
  return [...years].sort((a, b) => a - b);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function calendarYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1900 && value <= 2200) {
    return value;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return Number(iso[1]);
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (us) return Number(us[3]);
  if (/^\d{4}$/.test(text)) return Number(text);
  return null;
}

function filedDateText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function filingFromItem(item: unknown): FloridaAnnualReportFiling | null {
  if (typeof item === 'number' || typeof item === 'string') {
    const year = calendarYear(item);
    return year ? { year } : null;
  }
  const record = asRecord(item);
  if (!record) return null;
  const filed = filedDateText(
    record.filed_date ?? record.filedDate ?? record.file_date ?? record.date,
  );
  const year = calendarYear(
    record.year ?? record.report_year ?? record.reportYear ?? record.ar_year ?? filed,
  );
  if (!year) return null;
  return { year, ...(filed ? { filed_date: filed } : {}) };
}

function filingsFromList(value: unknown): FloridaAnnualReportFiling[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filings: FloridaAnnualReportFiling[] = [];
  for (const item of value) {
    const filing = filingFromItem(item);
    if (filing) filings.push(filing);
  }
  return filings;
}

const ANNUAL_REPORT_LIST_KEYS = [
  'annual_reports',
  'annualReports',
  'report_years',
  'reportYears',
  'annual_report_years',
  'annualReportYears',
  'last_three_annual_reports',
  'lastThreeAnnualReports',
  'annual_report_filings',
  'annualReportFilings',
  'ar_filings',
  'arFilings',
];

function numberedReportFilings(source: Record<string, unknown>): FloridaAnnualReportFiling[] | undefined {
  let found = false;
  const filings: FloridaAnnualReportFiling[] = [];
  for (const slot of [1, 2, 3]) {
    const yearKey = [`ar_year_${slot}`, `report_year_${slot}`, `annual_report_year_${slot}`].find(
      (key) => key in source,
    );
    const dateKey = [
      `ar_date_${slot}`,
      `ar_filed_date_${slot}`,
      `report_date_${slot}`,
      `annual_report_date_${slot}`,
      `filed_date_${slot}`,
    ].find((key) => key in source);
    if (!yearKey && !dateKey) continue;
    found = true;
    const filed = dateKey ? filedDateText(source[dateKey]) : undefined;
    const year = calendarYear(yearKey ? source[yearKey] : undefined) ?? calendarYear(filed);
    if (year) filings.push({ year, ...(filed ? { filed_date: filed } : {}) });
  }
  return found ? filings : undefined;
}

function recordSources(body: unknown): Record<string, unknown>[] {
  const record = asRecord(body);
  if (!record) return [];
  return [record, asRecord(record.cordata), asRecord(record.cordata_record)].filter(
    (source): source is Record<string, unknown> => Boolean(source),
  );
}

/**
 * Annual-report years from a Sunbiz Daily or cordata record.
 * A returned array, including an empty one, means the table was present.
 * `undefined` means the record did not say which years were filed.
 */
export function readAnnualReportFilings(body: unknown): FloridaAnnualReportFiling[] | undefined {
  for (const source of recordSources(body)) {
    for (const key of ANNUAL_REPORT_LIST_KEYS) {
      if (key in source && Array.isArray(source[key])) return filingsFromList(source[key]);
    }
    const numbered = numberedReportFilings(source);
    if (numbered) return numbered;
  }
  return undefined;
}

function isAnnualReportEvent(value: unknown): boolean {
  return typeof value === 'string' && /annual\s*reports?/i.test(value);
}

/** Years named by a last-event or history row. Not a complete filing table. */
export function readEventFiledYears(body: unknown): number[] {
  const years = new Set<number>();
  for (const source of recordSources(body)) {
    const event = ['last_event', 'lastEvent', 'last_transaction', 'lastTransaction']
      .map((key) => source[key])
      .find((value) => typeof value === 'string');
    const eventDate = [
      'last_event_file_date',
      'lastEventFileDate',
      'event_date_filed',
      'eventDateFiled',
      'last_event_date',
      'lastEventDate',
    ]
      .map((key) => source[key])
      .find((value) => typeof value === 'string');
    if (isAnnualReportEvent(event)) {
      const year = calendarYear(eventDate) ?? calendarYear(event);
      if (year) years.add(year);
    }
    const history = source.events ?? source.filing_history ?? source.filingHistory ?? source.history;
    if (!Array.isArray(history)) continue;
    for (const item of history) {
      const record = asRecord(item);
      const label = record
        ? [record.type, record.event, record.label, record.description, record.name]
            .filter((part) => typeof part === 'string')
            .join(' ')
        : typeof item === 'string'
          ? item
          : '';
      if (!isAnnualReportEvent(label)) continue;
      const year = record
        ? calendarYear(record.year ?? record.report_year) ??
          calendarYear(record.date ?? record.filed_date ?? record.file_date ?? record.event_date)
        : calendarYear(label);
      if (year) years.add(year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

const FILE_DATE_KEYS = [
  'file_date',
  'fileDate',
  'filing_date',
  'filingDate',
  'date_filed',
  'dateFiled',
  'formation_date',
  'formationDate',
];

/** Formation date as printed on the record. The year is not shifted through UTC. */
export function readFloridaFileDate(body: unknown): string | undefined {
  for (const source of recordSources(body)) {
    for (const key of FILE_DATE_KEYS) {
      const value = filedDateText(source[key]);
      if (value) return value;
    }
  }
  return undefined;
}

export function parseFloridaDetailFacts(html: string): {
  years: number[];
  hasAnnualReportTable: boolean;
  fileDate?: string;
  lastEvent?: string;
  lastEventDate?: string;
} {
  const labeled = (id: string) => {
    const match = html.match(
      new RegExp(`<label[^>]*for="${id}"[^>]*>[^<]*</label>\\s*<span>([^<]+)</span>`, 'i'),
    );
    const value = match?.[1]?.replace(/\s+/g, ' ').trim();
    return value || undefined;
  };
  return {
    years: parseFloridaAnnualReportYears(html),
    hasAnnualReportTable: html.includes('Annual Reports'),
    fileDate: labeled('Detail_FileDate'),
    lastEvent: labeled('Detail_LastEvent'),
    lastEventDate: labeled('Detail_LastEventFileDate'),
  };
}

export function mapSunbizDailyDetailBody(body: unknown): FloridaEntityDetail {
  const b = body as FloridaEntityDetail;
  const annual_reports = readAnnualReportFilings(body);
  const event_filed_years = readEventFiledYears(body);
  return {
    corporation_number: String(b.corporation_number ?? ''),
    corporation_name: String(b.corporation_name ?? ''),
    filing_type: b.filing_type,
    filing_type_display: b.filing_type_display,
    status: b.status,
    file_date: readFloridaFileDate(body),
    source_date: b.source_date,
    fei_number: b.fei_number,
    principal_address: b.principal_address ?? null,
    mailing_address: b.mailing_address ?? null,
    registered_agent: b.registered_agent ?? null,
    officers: Array.isArray(b.officers) ? b.officers : [],
    industries: Array.isArray(b.industries) ? b.industries : [],
    ...(annual_reports !== undefined ? { annual_reports } : {}),
    ...(event_filed_years.length ? { event_filed_years } : {}),
    url: b.url,
  };
}

async function fetchFloridaEntityFromSunbizDaily(
  documentNumber: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<FloridaEntityDetail> {
  const url = `${SUNBIZDAILY_BASE_URL}/filings/${encodeURIComponent(documentNumber)}/`;
  return withTimeout(async (s) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'LaunchForma/1.0 (+entity-detail)',
        },
        signal: s,
        cache: 'no-store',
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new SunbizError('timeout', 'sunbizdaily entity detail timed out');
      }
      throw new SunbizError(
        'unknown',
        `sunbizdaily detail failed: ${(err as Error)?.message ?? String(err)}`,
        err,
      );
    }

    if (res.status === 404) {
      throw new SunbizError(
        'not_found',
        'No match in Sunbiz Daily for that document number (older or unindexed entities). ' +
          'Add the legal entity name as on Sunbiz.org and try again, or confirm the number on the state site.',
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new SunbizError(
        'auth',
        'sunbizdaily rejected the API key (401/403). Check SUNBIZDAILY_API_KEY.',
      );
    }
    if (res.status === 429) {
      throw new SunbizError('rate_limit', 'sunbizdaily rate limit exceeded. Try again shortly.');
    }
    if (!res.ok) {
      throw new SunbizError('http', `sunbizdaily returned HTTP ${res.status}`);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new SunbizError('parse', 'sunbizdaily returned non-JSON', err);
    }
    return mapSunbizDailyDetailBody(body);
  }, signal);
}

type SeedEntityRow = {
  name: string;
  documentNumber: string;
  status: string;
  filingDate: string;
  type: 'LLC' | 'CORP';
};

function detailFromLocalSeed(documentNumber: string): FloridaEntityDetail | null {
  if (process.env.LINK_ENTITY_ALLOW_SEED_LOOKUP !== 'true') return null;
  try {
    const p = join(process.cwd(), 'data', 'sunbiz-seed.json');
    const seedData = JSON.parse(readFileSync(p, 'utf8')) as SeedEntityRow[];
    const norm = normalizeFloridaDocumentNumber(documentNumber);
    const row = seedData.find((r) => r.documentNumber.toUpperCase() === norm);
    if (!row) return null;
    return {
      corporation_number: row.documentNumber,
      corporation_name: row.name,
      filing_type: row.type === 'LLC' ? 'FLAL' : 'DOMP',
      filing_type_display: row.type === 'LLC' ? 'Florida Limited Liability' : 'Foreign Profit Corporation',
      status: row.status === 'Active' ? 'A' : 'I',
      file_date: row.filingDate,
      principal_address: null,
      mailing_address: null,
      registered_agent: null,
      officers: [],
      industries: [],
    };
  } catch {
    return null;
  }
}

function inferFilingTypeDisplayFromDocumentNumber(doc: string): string {
  const c = doc.charAt(0).toUpperCase();
  if (c === 'L') return 'Florida Limited Liability Company';
  if (c === 'P' || c === 'F') return 'Florida Profit Corporation';
  return 'Florida Corporation';
}

/** Minimal detail when only Sunbiz Daily list row or Sunbiz.org search row is available (no detail API). */
function detailFromSunbizEntityHit(hit: SunbizEntity): FloridaEntityDetail {
  const doc = normalizeFloridaDocumentNumber(hit.documentNumber);
  return {
    corporation_number: doc,
    corporation_name: hit.name,
    filing_type_display: inferFilingTypeDisplayFromDocumentNumber(doc),
    status: hit.status?.charAt(0) ?? undefined,
    principal_address: null,
    mailing_address: null,
    registered_agent: null,
    officers: [],
    industries: [],
  };
}

async function findViaSunbizDailyNameSearch(
  docNorm: string,
  legalName: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<FloridaEntityDetail | null> {
  const entities = await searchSunbizDaily(legalName, apiKey, { limit: 100, signal });
  const hit = entities.find((e) => normalizeFloridaDocumentNumber(e.documentNumber) === docNorm);
  if (!hit) return null;
  try {
    return await fetchFloridaEntityFromSunbizDaily(docNorm, apiKey, signal);
  } catch (err) {
    if (err instanceof SunbizError && err.code === 'not_found') {
      return detailFromSunbizEntityHit(hit);
    }
    throw err;
  }
}

async function findViaSunbizOrgNameScrape(
  docNorm: string,
  legalName: string,
  signal?: AbortSignal,
): Promise<FloridaEntityDetail | null> {
  try {
    const entities = await searchSunbizScrape(legalName, { limit: 100, signal });
    const hit = entities.find((e) => normalizeFloridaDocumentNumber(e.documentNumber) === docNorm);
    if (!hit) return null;
    return detailFromSunbizEntityHit(hit);
  } catch {
    return null;
  }
}

export interface FetchFloridaEntityOptions {
  signal?: AbortSignal;
  /**
   * Legal name as shown on Sunbiz.org - enables fallback name search when
   * Sunbiz Daily has no row for the document number alone.
   */
  legalNameHint?: string;
}

/**
 * Call the local Python cloudscraper sidecar (`scripts/sunbiz-scraper/app.py`)
 * when `SUNBIZ_LOCAL_PROXY_URL` is set (e.g. `http://localhost:3334`).
 * This bypasses Cloudflare using the user's residential IP and a real TLS fingerprint.
 */
async function fetchFloridaEntityFromLocalProxy(
  documentNumber: string,
  signal?: AbortSignal,
): Promise<FloridaEntityDetail> {
  const base = process.env.SUNBIZ_LOCAL_PROXY_URL!.replace(/\/$/, '');
  const url = `${base}/entity?doc=${encodeURIComponent(documentNumber)}`;

  // Shared-secret for the hosted sidecar (matches SUNBIZ_PROXY_TOKEN on the
  // scraper service). Optional for local dev where the sidecar is unguarded.
  const proxyToken = process.env.SUNBIZ_PROXY_TOKEN?.trim();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (proxyToken) headers['X-Proxy-Token'] = proxyToken;

  return withTimeout(async (s) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        signal: s,
        cache: 'no-store',
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw new SunbizError('timeout', 'Local Sunbiz proxy timed out.');
      }
      throw new SunbizError(
        'unknown',
        `Local Sunbiz proxy unreachable: ${(err as Error)?.message ?? String(err)}. ` +
          'Make sure the scraper is running: cd scripts/sunbiz-scraper && python app.py',
        err,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new SunbizError('parse', 'Local Sunbiz proxy returned non-JSON.');
    }

    if (!res.ok) {
      const code = body?.code as string | undefined;
      const msg = (body?.error as string) ?? `HTTP ${res.status}`;
      if (res.status === 404 || code === 'not_found') {
        throw new SunbizError('not_found', msg);
      }
      if (res.status === 401 || code === 'unauthorized') {
        throw new SunbizError(
          'auth',
          'Sunbiz scraper rejected the request token. Check SUNBIZ_PROXY_TOKEN matches the service.',
        );
      }
      throw new SunbizError('unknown', msg);
    }

    return mapSunbizDailyDetailBody(body);
  }, signal);
}

/**
 * Full Florida entity record for a Division of Corporations document number.
 *
 * Resolution order:
 *   0. SUNBIZ_LOCAL_PROXY_URL set → call local Python cloudscraper sidecar (dev)
 *   1. Sunbiz Daily detail API `GET /filings/{corporation_number}/`
 *   2. If 404 and `legalNameHint`: Sunbiz Daily name search → exact document# match
 *   3. If still missing and `legalNameHint`: official search.sunbiz.org scrape (needs
 *      `SUNBIZ_SCRAPER_PROXY` on most hosts due to Cloudflare)
 *   4. Local seed when `LINK_ENTITY_ALLOW_SEED_LOOKUP=true` and no API key
 */
/**
 * Sunbiz Daily's documented filing JSON has file_date and no annual-report table.
 * Any report years, last-three dates, or annual-report events on the record are
 * read first. A configured scraper can fill a missing table from search.sunbiz.org.
 * A missing proxy, a Cloudflare block, or a failed scrape leaves the table unknown.
 * Unknown years are not a reason to quote.
 */
async function withAnnualReports(
  detail: FloridaEntityDetail,
  signal?: AbortSignal,
): Promise<FloridaEntityDetail> {
  const needsYears = detail.annual_reports === undefined;
  const needsDate = !detail.file_date;
  const needsEvent = !detail.event_filed_years?.length;
  if (!needsYears && !needsDate && !needsEvent) return detail;
  const proxy = process.env.SUNBIZ_SCRAPER_PROXY?.trim();
  if (!proxy || !detail.corporation_number) return detail;
  const target =
    `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults` +
    `?inquiryType=DocumentNumber&searchTerm=${encodeURIComponent(detail.corporation_number)}`;
  try {
    const html = await fetchScrapeViaProxy(target, proxy, signal);
    if (looksLikeCloudflareChallenge(html)) return detail;
    const facts = parseFloridaDetailFacts(html);
    const eventYears = isAnnualReportEvent(facts.lastEvent)
      ? [calendarYear(facts.lastEventDate) ?? calendarYear(facts.lastEvent)].filter(
          (year): year is number => year !== null,
        )
      : [];
    return {
      ...detail,
      file_date: detail.file_date || facts.fileDate,
      ...(needsYears && facts.hasAnnualReportTable
        ? { annual_reports: facts.years.map((year) => ({ year })) }
        : {}),
      ...(needsEvent && eventYears.length ? { event_filed_years: eventYears } : {}),
    };
  } catch {
    return detail;
  }
}

export async function fetchFloridaEntityDetailByDocumentNumber(
  rawDocumentNumber: string,
  opts: FetchFloridaEntityOptions = {},
): Promise<FloridaEntityDetail> {
  const documentNumber = normalizeFloridaDocumentNumber(rawDocumentNumber);
  if (documentNumber.length < 5 || documentNumber.length > 20) {
    throw new SunbizError('parse', 'Enter a valid Florida document number (e.g. L15000063512).');
  }

  // ── Step 0: local cloudscraper sidecar (highest priority in dev) ────────
  const localProxy = process.env.SUNBIZ_LOCAL_PROXY_URL?.trim();
  if (localProxy) {
    return withAnnualReports(
      await fetchFloridaEntityFromLocalProxy(documentNumber, opts.signal),
      opts.signal,
    );
  }

  const apiKey = process.env.SUNBIZDAILY_API_KEY?.trim();
  const legal = opts.legalNameHint?.trim();

  if (apiKey) {
    try {
      return withAnnualReports(
        await fetchFloridaEntityFromSunbizDaily(documentNumber, apiKey, opts.signal),
        opts.signal,
      );
    } catch (err) {
      if (!(err instanceof SunbizError) || err.code !== 'not_found') throw err;

      if (legal) {
        const viaNameDaily = await findViaSunbizDailyNameSearch(
          documentNumber,
          legal,
          apiKey,
          opts.signal,
        );
        if (viaNameDaily) return withAnnualReports(viaNameDaily, opts.signal);

        const viaScrape = await findViaSunbizOrgNameScrape(documentNumber, legal, opts.signal);
        if (viaScrape) return withAnnualReports(viaScrape, opts.signal);

        throw new SunbizError(
          'not_found',
          `No entity found with document number ${documentNumber} when searching for "${legal}". ` +
            'Check spelling against Sunbiz.org or try the official document search.',
        );
      }

      throw new SunbizError(
        'not_found',
        err.message +
          ' If your company is older, paste the **legal entity name** (as on Sunbiz) into the optional field and look up again - we will match by name and confirm the document number.',
      );
    }
  }

  const seedDetail = detailFromLocalSeed(documentNumber);
  if (seedDetail) return withAnnualReports(seedDetail, opts.signal);

  if (legal) {
    const viaScrape = await findViaSunbizOrgNameScrape(documentNumber, legal, opts.signal);
    if (viaScrape) return withAnnualReports(viaScrape, opts.signal);
    throw new SunbizError(
      'not_found',
      `No match for document ${documentNumber} when searching Sunbiz for "${legal}". ` +
        'Set SUNBIZDAILY_API_KEY for primary lookup, and/or SUNBIZ_SCRAPER_PROXY for live Sunbiz name search from servers behind Cloudflare.',
    );
  }

  throw new SunbizError(
    'not_configured',
    'Entity lookup requires SUNBIZDAILY_API_KEY, or set LINK_ENTITY_ALLOW_SEED_LOOKUP=true for local seed data. ' +
      'You can also add the legal name and set SUNBIZ_SCRAPER_PROXY to search live Sunbiz.org.',
  );
}
