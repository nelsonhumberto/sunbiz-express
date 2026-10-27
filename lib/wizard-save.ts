import {
  isActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
} from '@/lib/action-timeout';

export type WizardSaveOutcome<T> =
  | { type: 'value'; value: T }
  | { type: 'timeout' }
  | { type: 'redirect'; href: string | null }
  | { type: 'error' }
  | { type: 'aborted' };

export function isWizardSaveCurrent(startedGeneration: number, currentGeneration: number): boolean {
  return startedGeneration === currentGeneration;
}

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Run a wizard save until it settles, the deadline passes, or `signal` aborts.
 * The returned promise always settles, including when `task` never does,
 * so the caller can clear "Saving…" on every path. An abort wins over a
 * later value so a stale save cannot overwrite a newer one.
 */
export async function runWizardSave<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<WizardSaveOutcome<T>> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    if (controller.signal.aborted) return { type: 'aborted' };
    const work = new Promise<T>((resolve, reject) => {
      const fail = () => reject(abortError());
      if (controller.signal.aborted) {
        fail();
        return;
      }
      controller.signal.addEventListener('abort', fail, { once: true });
      Promise.resolve()
        .then(() => task(controller.signal))
        .then(
          (value) => {
            controller.signal.removeEventListener('abort', fail);
            if (controller.signal.aborted) reject(abortError());
            else resolve(value);
          },
          (error) => {
            controller.signal.removeEventListener('abort', fail);
            reject(error);
          },
        );
    });
    const value = await withActionTimeout(work, timeoutMs);
    if (controller.signal.aborted) return { type: 'aborted' };
    return { type: 'value', value };
  } catch (err) {
    if (controller.signal.aborted || isAbortError(err)) return { type: 'aborted' };
    const href = redirectHrefFromError(err);
    if (href || isRedirectError(err)) return { type: 'redirect', href };
    if (isActionTimeoutError(err)) return { type: 'timeout' };
    return { type: 'error' };
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
