'use client';

import { useRef, useState, useTransition } from 'react';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ActionTimeoutError,
  isRedirectError,
  redirectHrefFromError,
  withActionTimeout,
  WIZARD_ACTION_TIMEOUT_MS,
} from '@/lib/action-timeout';

type StepResult = { ok?: boolean; error?: string } | void | undefined;

/**
 * Run a wizard save so the button always leaves "Saving…".
 * Double-clicks are ignored. Timeouts and thrown errors become a visible
 * message the customer can retry. Redirects still navigate.
 */
export function useWizardSubmit() {
  const t = useTranslations('wizard');
  const router = useLocalizedRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const lock = useRef(false);

  function run(task: () => Promise<StepResult>, timeoutMs: number = WIZARD_ACTION_TIMEOUT_MS) {
    if (lock.current || pending) return;
    lock.current = true;
    setError(null);
    start(async () => {
      try {
        const result = await withActionTimeout(task(), timeoutMs);
        if (result && typeof result === 'object' && result.ok === false) {
          const message = result.error || t('errorSaveGeneric');
          setError(message);
          toast.error(message);
        }
      } catch (err) {
        const href = redirectHrefFromError(err);
        if (href) {
          router.push(href);
          return;
        }
        if (isRedirectError(err)) return;
        const message =
          err instanceof ActionTimeoutError ? t('errorTimeout') : t('errorSaveGeneric');
        setError(message);
        toast.error(message);
      } finally {
        lock.current = false;
      }
    });
  }

  return { pending, error, setError, run };
}
