'use client';

import { useRef, useState } from 'react';
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
 * Double-clicks are ignored. Timeouts and thrown errors become a visible
 * message the customer can retry. Redirects still navigate.
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
  const lock = useRef(false);

  function markStepCompleted() {
    if (!analytics?.filingId) return;
    trackEvent('wizard_step_completed', {
      step: analytics.step,
      filing_id: analytics.filingId,
    });
  }

  function run(task: () => Promise<StepResult>, timeoutMs: number = WIZARD_ACTION_TIMEOUT_MS) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    void (async () => {
      try {
        const outcome = await runWizardSave(task, timeoutMs);
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
        lock.current = false;
        setPending(false);
      }
    })();
  }

  return { pending, error, setError, run };
}
