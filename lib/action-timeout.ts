/**
 * Client- and server-safe helpers so wizard and auth submits always settle.
 * A hung server action (redirect that never resolves, dropped response) used
 * to leave "Saving…" / "Starting your draft…" up forever.
 */

export const WIZARD_ACTION_TIMEOUT_MS = 20_000;

/** Step 2 must leave Saving even when Sunbiz or the database is slow. */
export const STEP2_SAVE_TIMEOUT_MS = 5_000;

export class ActionTimeoutError extends Error {
  constructor() {
    super('ACTION_TIMEOUT');
    this.name = 'ActionTimeoutError';
  }
}

export function isActionTimeoutError(error: unknown): boolean {
  return error instanceof ActionTimeoutError || (error instanceof Error && error.message === 'ACTION_TIMEOUT');
}

/**
 * Race `work` against a timer. The underlying request is not aborted (server
 * actions have no abort signal here); the caller just stops waiting and can
 * show an error plus a retry.
 */
export async function withActionTimeout<T>(
  work: Promise<T>,
  ms: number = WIZARD_ACTION_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ActionTimeoutError()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Next.js `redirect()` throws an error whose digest is
 * `NEXT_REDIRECT;<type>;<url>;<status>;`. Pull a same-origin path out of it
 * so a caught redirect can still navigate.
 */
export function redirectHrefFromError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const digest = 'digest' in error ? String((error as { digest?: unknown }).digest ?? '') : '';
  if (!digest.startsWith('NEXT_REDIRECT')) return null;
  const parts = digest.split(';');
  const raw = parts[2];
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function isRedirectError(error: unknown): boolean {
  if (redirectHrefFromError(error)) return true;
  if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) return true;
  if (!error || typeof error !== 'object') return false;
  const digest = 'digest' in error ? String((error as { digest?: unknown }).digest ?? '') : '';
  return digest.startsWith('NEXT_REDIRECT');
}
