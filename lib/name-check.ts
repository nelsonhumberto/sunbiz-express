/**
 * Shared name-check helpers for the homepage, the wizard, and
 * /api/sunbiz/name-check.
 *
 * Error payloads use status "error". A body that says status "available"
 * while available is false is not a successful check.
 */

import { joinEntityName } from '@/lib/florida';

export const NAME_CHECK_MAX_LENGTH = 100;
export const NAME_CHECK_CLIENT_TIMEOUT_MS = 15_000;
export const NAME_CHECK_DEBOUNCE_MS = 600;
/** How long Retry stays disabled after a 429. */
export const NAME_CHECK_RATE_LIMIT_COOLDOWN_MS = 8_000;

export interface NameCheckResult {
  query: string;
  available: boolean;
  status: 'available' | 'exact_conflict' | 'similar_conflict' | 'restricted';
  message: string;
  conflicts: { name: string; documentNumber: string; status: string; filingDate?: string }[];
  suggestions: string[];
}

export interface NameCheckErrorResponse {
  query: string;
  available: false;
  status: 'error';
  error: string;
  message: string;
  conflicts: [];
  suggestions: [];
}

export type NameCheckOutcome =
  | {
      deferred: false;
      status: NameCheckResult['status'];
      ms: number;
      error?: undefined;
      result: NameCheckResult;
    }
  | {
      deferred: true;
      status: 'error';
      ms: number;
      error: string;
      result: null;
    };

const SUCCESS_STATUSES = new Set<NameCheckResult['status']>([
  'available',
  'exact_conflict',
  'similar_conflict',
  'restricted',
]);

/** Florida blocks a name only when Sunbiz reports an exact conflict. */
export function nameCheckBlocksContinue(
  result: { status?: string } | null | undefined,
): boolean {
  return result?.status === 'exact_conflict';
}

export function normalizeNameCheckQuery(raw: string | null | undefined): string {
  return (raw ?? '').trim().slice(0, NAME_CHECK_MAX_LENGTH);
}

/** Filing name wins. The start-form seed is the fallback. */
export function seededBusinessName(
  filingBusinessName?: string | null,
  defaultBusinessName?: string | null,
): string {
  const fromFiling = normalizeNameCheckQuery(filingBusinessName);
  if (fromFiling) return fromFiling;
  return normalizeNameCheckQuery(defaultBusinessName);
}

/**
 * Homepage "Check name" target. Empty input returns null so the form can
 * ask for a name instead of opening /start with nothing to check.
 */
export function startHrefForNameCheck(stateCode: string, rawName: string): string | null {
  const name = normalizeNameCheckQuery(rawName);
  if (!name) return null;
  const state = (stateCode || 'FL').trim().toUpperCase() || 'FL';
  const params = new URLSearchParams({ state, name });
  return `/start?${params.toString()}`;
}

/** The seeded name checks immediately. Later edits wait out the debounce. */
export function nameCheckDelayMs(name: string, seededName: string): number {
  const seeded = seededName.trim();
  if (seeded.length >= 2 && name.trim() === seeded) return 0;
  return NAME_CHECK_DEBOUNCE_MS;
}

export function nameCheckRequestUrl(
  name: string,
  entityType: 'LLC' | 'CORP',
  options?: { fresh?: boolean },
): string {
  const params = new URLSearchParams({ name, type: entityType });
  if (options?.fresh) params.set('fresh', String(Date.now()));
  return `/api/sunbiz/name-check?${params.toString()}`;
}

const nameCheckCache = new Map<string, NameCheckResult>();

export function nameCheckCacheKey(name: string, entityType: 'LLC' | 'CORP'): string {
  return `${entityType}:${name.trim().toLowerCase()}`;
}

export function readNameCheckCache(
  name: string,
  entityType: 'LLC' | 'CORP',
): NameCheckResult | null {
  return nameCheckCache.get(nameCheckCacheKey(name, entityType)) ?? null;
}

export function writeNameCheckCache(
  name: string,
  entityType: 'LLC' | 'CORP',
  result: NameCheckResult,
): void {
  nameCheckCache.set(nameCheckCacheKey(name, entityType), result);
}

export function clearNameCheckCache(): void {
  nameCheckCache.clear();
}

export function isRateLimitError(error: string | undefined): boolean {
  return error === 'rate_limit' || error === 'http_429';
}

export function rateLimitCooldownUntil(
  now: number,
  cooldownMs = NAME_CHECK_RATE_LIMIT_COOLDOWN_MS,
): number {
  return now + cooldownMs;
}

export function nameCheckSubmittedEvent(source: 'hero' | 'wizard') {
  return {
    event: 'name_check_submitted' as const,
    properties: { source },
  };
}

export function nameCheckResultEvent(input: { status: string; ms: number; error?: string }) {
  const properties: { status: string; ms: number; error?: string } = {
    status: input.status,
    ms: input.ms,
  };
  if (input.error) properties.error = input.error;
  return {
    event: 'name_check_result' as const,
    properties,
  };
}

/** Fired when a lookup cannot be completed. outcome is always "error". */
export function nameCheckErrorEvent(input: {
  source: 'hero' | 'wizard';
  error?: string;
  ms?: number;
}) {
  const properties: { outcome: 'error'; source: 'hero' | 'wizard'; error?: string; ms?: number } = {
    outcome: 'error',
    source: input.source,
  };
  if (input.error) properties.error = input.error;
  if (typeof input.ms === 'number') properties.ms = input.ms;
  return {
    event: 'name_check' as const,
    properties,
  };
}

const NAME_SUFFIX_PEEL_LIMIT = 4;

/**
 * Endings that can only be a legal suffix. Co and Company are excluded:
 * they stay in the typed name and the widget shows a hint.
 */
const UNAMBIGUOUS_SUFFIXES = [
  'Limited Liability Company',
  'L.L.C.',
  'L.L.C',
  'Corporation',
  'Incorporated',
  'LLC',
  'Inc',
  'Corp',
] as const;

const LLC_UNAMBIGUOUS = ['Limited Liability Company', 'L.L.C.', 'L.L.C', 'LLC'] as const;
const CORP_UNAMBIGUOUS = ['Corporation', 'Incorporated', 'Inc', 'Corp'] as const;

/**
 * Drop an unambiguous trailing ending (LLC, L.L.C., Inc, Corp, Corporation,
 * and the long forms). Co and Company stay. Leaves the string unchanged when
 * nothing matches, including trailing spaces, so typing is not interrupted.
 * Repeats so "Name LLC LLC" becomes "Name".
 */
export function peelTypedSuffix(name: string): string {
  const original = name ?? '';
  let current = original.trim();
  let peeled = false;
  for (let i = 0; i < NAME_SUFFIX_PEEL_LIMIT; i++) {
    const next = peelOneUnambiguousSuffix(current);
    if (!next) break;
    current = next.base;
    peeled = true;
  }
  return peeled ? current : original;
}

export type AmbiguousSuffix = 'co' | 'company';

/** Co or Company at the end of the typed name. Company wins over Co. */
export function trailingAmbiguousSuffix(name: string): AmbiguousSuffix | null {
  const trimmed = (name ?? '').trim();
  if (/(?:,\s*|\s+)company\.?$/i.test(trimmed)) return 'company';
  if (/(?:,\s*|\s+)co\.?$/i.test(trimmed)) return 'co';
  return null;
}

function peelOneUnambiguousSuffix(
  name: string,
): { base: string; suffix: string } | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const sorted = [...UNAMBIGUOUS_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const suffix of sorted) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:,\\s*|\\s+)${escaped}\\.?\\s*$`, 'i');
    if (!re.test(trimmed)) continue;
    return { base: trimmed.replace(re, '').trim(), suffix };
  }
  return null;
}

/** Letters and numbers that remain after legal endings are removed. */
export function realNameCharacterCount(name: string): number {
  const peeled = peelTypedSuffix(name).trim();
  return peeled.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

export function nameHasMinimumSubstance(name: string): boolean {
  return realNameCharacterCount(name) >= 2;
}

/**
 * One legal ending only. "Acme LLC LLC" for an LLC filing is stored as
 * "Acme LLC". A typed ending from the other entity type is dropped and the
 * filing's own ending is used.
 */
export function canonicalFiledName(name: string, entityType: 'LLC' | 'CORP'): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const allowed = entityType === 'LLC' ? LLC_UNAMBIGUOUS : CORP_UNAMBIGUOUS;
  let current = trimmed;
  let keptSuffix: string | null = null;
  for (let i = 0; i < NAME_SUFFIX_PEEL_LIMIT; i++) {
    const peeled = peelOneUnambiguousSuffix(current);
    if (!peeled) break;
    const sameType = allowed.some((suffix) => suffix.toLowerCase() === peeled.suffix.toLowerCase());
    if (sameType) keptSuffix = peeled.suffix;
    current = peeled.base;
    if (!current) break;
  }
  if (!current) return '';
  if (keptSuffix) {
    return joinEntityName(current, keptSuffix).slice(0, NAME_CHECK_MAX_LENGTH);
  }
  // Co / Company are a real corp ending. Keep them instead of appending Corp.
  if (entityType === 'CORP' && trailingAmbiguousSuffix(current)) {
    return current.slice(0, NAME_CHECK_MAX_LENGTH);
  }
  const suffix = entityType === 'LLC' ? 'LLC' : 'Corp';
  return joinEntityName(current, suffix).slice(0, NAME_CHECK_MAX_LENGTH);
}

export const NAME_TOO_SHORT_ERROR =
  'Enter at least 2 letters or numbers. The legal ending does not count.';

export function nameCheckErrorResponse(input: {
  query?: string;
  error: string;
  message: string;
}): NameCheckErrorResponse {
  return {
    query: input.query ?? '',
    available: false,
    status: 'error',
    error: input.error,
    message: input.message,
    conflicts: [],
    suggestions: [],
  };
}

export function nameCheckClientError(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name?: unknown }).name);
    if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  }
  return 'network';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function parseSuccess(body: Record<string, unknown>): NameCheckResult | null {
  const status = body.status;
  if (typeof status !== 'string' || !SUCCESS_STATUSES.has(status as NameCheckResult['status'])) {
    return null;
  }
  if (typeof body.available !== 'boolean') return null;
  // status "available" with available false is the old error shape.
  if (status === 'available' && body.available === false) return null;
  const typed = status as NameCheckResult['status'];
  return {
    query: typeof body.query === 'string' ? body.query : '',
    available: body.available,
    status: typed,
    message: typeof body.message === 'string' ? body.message : '',
    conflicts: Array.isArray(body.conflicts)
      ? (body.conflicts as NameCheckResult['conflicts'])
      : [],
    suggestions: Array.isArray(body.suggestions)
      ? body.suggestions.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function errorFromBody(body: Record<string, unknown> | null, httpStatus: number): string {
  const code = body && typeof body.error === 'string' ? body.error.trim() : '';
  if (code) return code;
  if (httpStatus < 200 || httpStatus >= 300) return `http_${httpStatus}`;
  return 'invalid_response';
}

function elapsedMs(started: number): number {
  return Math.max(0, Math.round(performance.now() - started));
}

export async function requestNameCheck(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = NAME_CHECK_CLIENT_TIMEOUT_MS,
): Promise<NameCheckOutcome> {
  const started = performance.now();
  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    const res = await fetchImpl(url, {
      ...(signal ? { signal } : {}),
      cache: 'no-store',
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const record = isRecord(body) ? body : null;
    const ms = elapsedMs(started);
    const success = res.ok && record ? parseSuccess(record) : null;
    if (!success) {
      return {
        deferred: true,
        status: 'error',
        ms,
        error: errorFromBody(record, res.status),
        result: null,
      };
    }
    return { deferred: false, status: success.status, ms, result: success };
  } catch (err) {
    return {
      deferred: true,
      status: 'error',
      ms: elapsedMs(started),
      error: nameCheckClientError(err),
      result: null,
    };
  }
}
