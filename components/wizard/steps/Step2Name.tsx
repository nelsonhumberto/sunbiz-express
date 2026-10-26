'use client';

import { useState } from 'react';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileText, ShieldCheck } from 'lucide-react';
import { saveStep2 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { useWizardSubmit } from '../useWizardSubmit';
import {
  NameCheckWidget,
  type NameCheckResult,
  type BusinessNameAssessment,
} from '../NameCheckWidget';
import { GuestEmailField } from '../GuestEmailField';
import { GuestSignInPrompt } from '../GuestSignInPrompt';
import type { WizardFiling } from '../types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  isActiveFormationState,
  getFormationState,
  type StateCode,
} from '@/lib/formation-states';
import { nameCheckBlocksContinue, nameHasMinimumSubstance, seededBusinessName } from '@/lib/name-check';

export function Step2Name({
  filing,
  needsGuestEmail = false,
  initialGuestEmail = '',
  pendingAccountEmail = '',
}: {
  filing: WizardFiling;
  needsGuestEmail?: boolean;
  initialGuestEmail?: string;
  pendingAccountEmail?: string;
}) {
  const t = useTranslations('wizard');
  const [name, setName] = useState(filing.businessName ?? '');
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(Boolean(pendingAccountEmail));
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const [assessment, setAssessment] = useState<BusinessNameAssessment | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [showNameError, setShowNameError] = useState(false);
  const { pending, error, run } = useWizardSubmit();
  const router = useLocalizedRouter(filing.locale);
  const formationState: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateName = getFormationState(formationState).name;

  // The legal ending does not count. "A LLC" is one real character and must
  // not pass. A failed name lookup does not disable Continue.
  const isHardBlocked = assessment ? !assessment.valid : false;
  const nameTooShort = !nameHasMinimumSubstance(name);
  const nameTaken = nameCheckBlocksContinue(result);
  const canContinue = !nameTooShort && !isHardBlocked && !nameTaken;

  const saveAndAdvance = () => {
    run(async () => {
      const res = await saveStep2({
        filingId: filing.id,
        businessName: name,
        available: result?.available ?? undefined,
        nameStatus: result?.status,
        contactEmail: needsGuestEmail ? guestEmail.trim() : undefined,
      });
      if (!res.ok) {
        if ('needsSignIn' in res && res.needsSignIn) {
          setNeedsSignIn(true);
          setEmailError(null);
          return;
        }
        setNeedsSignIn(false);
        setEmailError(res.error ?? null);
        return { ok: false, error: res.error };
      }
      router.push(`/wizard/${filing.id}/3`);
    });
  };

  const onContinue = () => {
    if (needsGuestEmail && !guestEmail.trim()) {
      setEmailError(t('guestEmailRequired'));
      return;
    }
    if (!canContinue) return;
    // If the state lookup says the name is taken, confirm via an accessible
    // dialog (keyboard + screen-reader friendly) instead of window.confirm().
    if (result && !result.available && !nameCheckBlocksContinue(result)) {
      setShowUnavailable(true);
      return;
    }
    saveAndAdvance();
  };

  return (
    <div className="space-y-6">
      {needsGuestEmail && (
        <GuestEmailField
          value={guestEmail}
          onChange={(value) => {
            setGuestEmail(value);
            setEmailError(null);
            setNeedsSignIn(false);
          }}
          error={emailError}
        />
      )}

      {needsSignIn && (
        <GuestSignInPrompt
          filingId={filing.id}
          email={pendingAccountEmail || guestEmail}
          returnStep={2}
          filingLocale={filing.locale}
        />
      )}

      <NameCheckWidget
        initialName={seededBusinessName(filing.businessName)}
        entityType={filing.entityType as 'LLC' | 'CORP'}
        formationState={formationState}
        onChange={(n, r, a) => {
          setName(n);
          setResult(r);
          setAssessment(a);
        }}
      />

      {/*
        A consolidated "this filing will need manual / paper review" banner
        when the customer's name triggers a state-specific manual-review rule
        (Wyoming "A" pattern, special characters, regulated word groups).
        We surface it once at the step level so the customer sees it next to
        the Continue button, in addition to the per-rule warnings rendered
        inside the widget.
      */}
      {assessment?.requiresManualReview && (
        <div className="rounded-lg border border-warn/30 bg-warn-subtle/40 p-4 flex items-start gap-3 text-sm text-ink leading-relaxed">
          <FileText className="h-5 w-5 text-warn shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{t('nameManualTitle')}</p>
            <p className="text-xs text-ink-muted">{t('nameManualBody')}</p>
          </div>
        </div>
      )}

      {nameTooShort && (showNameError || name.trim().length > 0) && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {t('nameTooShort')}
        </p>
      )}

      {isHardBlocked && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3 text-sm text-destructive leading-relaxed">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{t('nameHardBlockTitle')}</p>
            <p className="text-xs">{assessment?.error ?? t('nameHardBlockFallback')}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-ink-muted leading-relaxed">
        <p className="font-medium text-ink mb-1">{t('nameTipsTitle')}</p>
        <ul className="space-y-1 text-xs">
          <li>· {t('nameTip1', { state: stateName })}</li>
          <li>· {t('nameTip2')}</li>
          <li>· {t('nameTip3')}</li>
          <li>· {t('nameTip4')}</li>
        </ul>
      </div>

      {/* Approval guarantee - calms anxiety about state rejection. */}
      <div className="rounded-lg border border-success/30 bg-success-subtle/40 p-4 text-sm text-ink leading-relaxed flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-0.5">{t('nameGuaranteeTitle')}</p>
          <p className="text-xs text-ink-muted">{t('nameGuaranteeBody', { state: stateName })}</p>
        </div>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/1`}
        onNext={onContinue}
        nextDisabled={!canContinue}
        onBlocked={() => setShowNameError(true)}
        pending={pending}
        error={error}
      />

      <Dialog open={showUnavailable} onOpenChange={setShowUnavailable}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('nameUnavailableTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmNotAvailable', { state: stateName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnavailable(false)}>
              {t('nameUnavailableChange')}
            </Button>
            <Button
              onClick={() => {
                setShowUnavailable(false);
                saveAndAdvance();
              }}
            >
              {t('nameUnavailableProceed')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
