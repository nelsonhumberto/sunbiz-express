'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { WIZARD_ACTION_TIMEOUT_MS } from '@/lib/action-timeout';
import { runWizardSave } from '@/lib/wizard-save';
import { trackEvent } from '@/lib/analytics';
import { useWizardStepAnalytics } from './WizardStepAnalytics';

type StepResult = { ok?: boolean; error?: string } | void | undefined;

/**
 * Run a wizard save so the button always leaves "Saving…".
 * A newer save, Back, or unmount aborts the in-flight request. A stale
 * response cannot overwrite the newer result. Timeouts and thrown errors
 * become a visible message the customer can retry. Redirects still navigate.
 */
export function useWizardSubmit() {
  const t = useTranslations('wizard');
  const router = useLocalizedRouter();
  const analytics = useWizardStepAnalytics();
  const [error, setError] = useState<string | null>(null);
  // Local flag, not useTransition. A transition stays pending until the
  // server action settles, so a timeout used to leave "Saving…" up and
  // block the retry.
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  function markStepCompleted() {
    if (!analytics?.filingId) return;
    trackEvent('wizard_step_completed', {
      step: analytics.step,
      filing_id: analytics.filingId,
    });
  }

  function run(
    task: (signal: AbortSignal) => Promise<StepResult>,
    timeoutMs: number = WIZARD_ACTION_TIMEOUT_MS,
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = ++generation.current;
    setPending(true);
    setError(null);
    const stillCurrent = () => mounted.current && generation.current === gen;
    void (async () => {
      try {
        const outcome = await runWizardSave(task, timeoutMs, controller.signal);
        if (!stillCurrent() || outcome.type === 'aborted') return;
        if (outcome.type === 'redirect') {
          markStepCompleted();
          if (outcome.href) router.push(outcome.href);
          return;
        }
        if (outcome.type === 'timeout') {
          const message = t('errorTimeout');
          setError(message);
          toast.error(message);
          return;
        }
        if (outcome.type === 'error') {
          const message = t('errorSaveGeneric');
          setError(message);
          toast.error(message);
          return;
        }
        const result = outcome.value;
        if (result && typeof result === 'object' && result.ok === false) {
          const message = result.error || t('errorSaveGeneric');
          setError(message);
          toast.error(message);
        } else {
          markStepCompleted();
        }
      } finally {
        if (stillCurrent()) setPending(false);
      }
    })();
  }

  return { pending, error, setError, run };
}
