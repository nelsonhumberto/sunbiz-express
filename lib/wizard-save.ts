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
  | { type: 'error' };

/**
 * Run a wizard save until it settles or the deadline passes.
 * The returned promise always settles, including when `task` never does,
 * so the caller can clear "Saving…" on every path.
 */
export async function runWizardSave<T>(
  task: () => Promise<T>,
  timeoutMs: number,
): Promise<WizardSaveOutcome<T>> {
  try {
    const value = await withActionTimeout(Promise.resolve().then(task), timeoutMs);
    return { type: 'value', value };
  } catch (err) {
    const href = redirectHrefFromError(err);
    if (href || isRedirectError(err)) return { type: 'redirect', href };
    if (isActionTimeoutError(err)) return { type: 'timeout' };
    return { type: 'error' };
  }
}
