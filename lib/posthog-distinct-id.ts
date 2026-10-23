const DISTINCT_ID_MAX = 200;

/** Keep a PostHog distinct id safe to store in Stripe metadata. */
export function sanitizeDistinctId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > DISTINCT_ID_MAX) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

/** Cookie name posthog-js uses for `localStorage+cookie` persistence. */
export function posthogPersistenceCookieName(apiKey: string | null | undefined): string | null {
  const key = apiKey?.trim();
  if (!key) return null;
  return `ph_${key}_posthog`;
}

/** Read `distinct_id` from a posthog-js persistence cookie value. */
export function distinctIdFromPosthogCookie(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    /* already decoded */
  }
  for (const value of candidates) {
    try {
      const parsed = JSON.parse(value) as { distinct_id?: unknown };
      const id = sanitizeDistinctId(parsed?.distinct_id);
      if (id) return id;
    } catch {
      /* try the next encoding */
    }
  }
  return null;
}
