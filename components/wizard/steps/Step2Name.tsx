'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileText, ShieldCheck } from 'lucide-react';
import { saveStep2 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import {
  NameCheckWidget,
  type NameCheckResult,
  type BusinessNameAssessment,
} from '../NameCheckWidget';
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

export function Step2Name({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const [name, setName] = useState(filing.businessName ?? '');
  const [result, setResult] = useState<NameCheckResult | null>(null);
  const [assessment, setAssessment] = useState<BusinessNameAssessment | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const formationState: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateName = getFormationState(formationState).name;

  // The name widget owns the suffix dropdown so the suffix is always valid;
  // only gate Continue on (a) having an actual base name (>= 2 chars) and
  // (b) the rule-based assessment not flagging a hard block (restricted-word
  // groups configured to action: 'block').
  const isHardBlocked = assessment ? !assessment.valid : false;
  const canContinue = name.trim().length >= 2 && !isHardBlocked;

  const saveAndAdvance = () => {
    start(async () => {
      const res = await saveStep2({
        filingId: filing.id,
        businessName: name,
        available: result?.available ?? undefined,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('errorSaveGeneric'));
        return;
      }
      router.push(`/wizard/${filing.id}/3`);
    });
  };

  const onContinue = () => {
    if (!canContinue) return;
    // If the state lookup says the name is taken, confirm via an accessible
    // dialog (keyboard + screen-reader friendly) instead of window.confirm().
    if (result && !result.available) {
      setShowUnavailable(true);
      return;
    }
    saveAndAdvance();
  };

  return (
    <div className="space-y-6">
      <NameCheckWidget
        initialName={filing.businessName}
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
            <p className="font-semibold">This filing will be processed manually.</p>
            <p className="text-xs text-ink-muted">
              Your chosen name triggers a state rule that requires our team or the Secretary of
              State to file it on paper. The filing is still going through — it just won't run on
              the standard online queue, so expect additional processing time.
            </p>
          </div>
        </div>
      )}

      {isHardBlocked && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3 text-sm text-destructive leading-relaxed">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">We can't file this name as-is.</p>
            <p className="text-xs">
              {assessment?.error ?? 'Please adjust the name to continue.'}
            </p>
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

      {/* Approval guarantee — calms anxiety about state rejection. */}
      <div className="rounded-lg border border-success/30 bg-success-subtle/40 p-4 text-sm text-ink leading-relaxed flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold mb-0.5">Our name approval guarantee</p>
          <p className="text-xs text-ink-muted">
            If the {stateName} Department of State pushes back on this name for any reason, we work
            with you on revisions and resubmissions until your filing is approved — at no additional
            cost.
          </p>
        </div>
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/1`}
        onNext={onContinue}
        nextDisabled={!canContinue}
        pending={pending}
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
