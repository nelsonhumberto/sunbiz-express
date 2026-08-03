'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ShieldCheck,
  Building2,
  Info,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { saveStep6 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { safeParseJson, cn } from '@/lib/utils';
import { isPoBox } from '@/lib/formation-validation';
import { FORMATION_STATES, type StateCode } from '@/lib/formation-states';
import type { WizardFiling } from '../types';

interface RAStored extends AddressValue {
  type?: string;
  useOurService?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  signature?: string;
}

export function Step6RegisteredAgent({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const stateCode = (filing.state ?? 'FL') as StateCode;
  const stateRule = FORMATION_STATES[stateCode] ?? FORMATION_STATES.FL;
  const internalAgent = stateRule.registeredAgent;
  const stored = safeParseJson<RAStored | null>(filing.registeredAgent, null);

  const [useOurService, setUseOurService] = useState(stored?.useOurService ?? true);
  const [hardshipsAccepted, setHardshipsAccepted] = useState(stored?.useOurService === false);
  const [showHardshipDialog, setShowHardshipDialog] = useState(false);

  const [external, setExternal] = useState({
    name: stored?.useOurService ? '' : stored?.name ?? '',
    email: stored?.useOurService ? '' : stored?.email ?? '',
    phone: stored?.useOurService ? '' : stored?.phone ?? '',
    address: {
      street1: stored?.useOurService ? '' : stored?.street1 ?? '',
      street2: stored?.useOurService ? '' : stored?.street2 ?? '',
      city: stored?.useOurService ? '' : stored?.city ?? '',
      state: stateCode,
      zip: stored?.useOurService ? '' : stored?.zip ?? '',
    } as AddressValue,
  });
  const [internalConsent, setInternalConsent] = useState(
    stored?.useOurService === true && (stored?.signature?.length ?? 0) > 0,
  );
  const [externalSignature, setExternalSignature] = useState(
    stored?.useOurService === false ? stored?.signature ?? '' : '',
  );
  const [showRAHelp, setShowRAHelp] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const externalValid =
    !useOurService &&
    external.name.trim().length > 0 &&
    external.address.street1.trim().length > 0 &&
    external.address.city.trim().length > 0 &&
    external.address.zip.trim().length > 0 &&
    external.address.state.toUpperCase() === stateCode &&
    !isPoBox(external.address.street1);

  const canContinue = useOurService
    ? internalConsent
    : externalValid && externalSignature.trim().length >= 2;

  // Click handler for the secondary "own agent" panel — open confirmation
  // dialog first time, then allow toggle once hardships are acknowledged.
  const onClickOwnAgent = () => {
    if (!hardshipsAccepted) {
      setShowHardshipDialog(true);
      return;
    }
    setUseOurService(false);
  };

  const acceptHardshipsAndContinue = () => {
    setHardshipsAccepted(true);
    setUseOurService(false);
    setShowHardshipDialog(false);
  };

  const cancelHardshipsKeepLaunchForma = () => {
    setShowHardshipDialog(false);
    setUseOurService(true);
  };

  const onContinue = () => {
    start(async () => {
      const payload = useOurService
        ? {
            filingId: filing.id,
            useOurService: true,
            name: internalAgent.name,
            email: internalAgent.email,
            phone: internalAgent.phone,
            street1: internalAgent.street1,
            street2: internalAgent.street2,
            city: internalAgent.city,
            state: stateCode,
            zip: internalAgent.zip,
            signature: internalAgent.name,
          }
        : {
            filingId: filing.id,
            useOurService: false,
            name: external.name,
            email: external.email,
            phone: external.phone,
            street1: external.address.street1,
            street2: external.address.street2 ?? '',
            city: external.address.city,
            state: stateCode,
            zip: external.address.zip,
            signature: externalSignature,
          };
      const res = await saveStep6(payload);
      if (!res.ok) {
        toast.error(res.error ?? t('errorSaveGeneric'));
        return;
      }
      router.push(`/wizard/${filing.id}/7`);
    });
  };

  return (
    <div className="space-y-6">
      {/* Toggle — primary big card vs smaller secondary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Primary, recommended option (2/3 width on desktop) */}
        <button
          type="button"
          onClick={() => setUseOurService(true)}
          className={cn(
            'md:col-span-2 relative text-left rounded-2xl border-2 p-5 transition-all',
            useOurService
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border bg-white hover:border-primary/30'
          )}
        >
          <Badge variant="success" className="absolute -top-3 left-5">
            {t('freeYearBadge')}
          </Badge>
          <div className="flex items-start gap-3 mb-2">
            <div className="h-11 w-11 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">{t('useOurAgent')}</h3>
              <p className="text-xs text-ink-muted mt-0.5">{t('useOurAgentRecommended')}</p>
            </div>
          </div>
          <ul className="text-xs text-ink-muted space-y-1 mt-2">
            <li>· {t('useOurAgentP1', { state: stateRule.name })}</li>
            <li>· {t('useOurAgentP2')}</li>
            <li>· {t('useOurAgentP3')}</li>
            <li>· {t('useOurAgentP4')}</li>
          </ul>
        </button>

        {/* Secondary, smaller option */}
        <button
          type="button"
          onClick={onClickOwnAgent}
          className={cn(
            'relative text-left rounded-xl border p-4 transition-all flex flex-col justify-between',
            !useOurService
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border bg-white hover:border-primary/30'
          )}
        >
          <div>
            <div className="flex items-start gap-2 mb-1.5">
              <div className="h-8 w-8 rounded-lg bg-muted text-ink-muted flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium text-ink text-sm">{t('useOwnAgent')}</h3>
                <p className="text-[11px] text-ink-subtle leading-snug">{t('useOwnAgentDesc')}</p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-subtle italic">
            Most owners don&apos;t — review the responsibilities first.
          </p>
        </button>
      </div>

      {/* Internal agent display + consent */}
      {useOurService && (
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-primary">{t('yourRegisteredAgent')}</p>
              <button
                type="button"
                onClick={() => setShowRAHelp((s) => !s)}
                className="ml-auto inline-flex items-center gap-1 text-xs text-ink-muted hover:text-primary"
              >
                <HelpCircle className="h-3 w-3" />
                {t('raHelpToggle')}
              </button>
            </div>
            {showRAHelp && (
              <div className="rounded-md bg-white border border-primary/10 p-3 text-xs text-ink-muted leading-relaxed">
                {t('raHelpBody')}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider mb-1">{t('nameLabel')}</p>
                <p className="font-medium">{internalAgent.name}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider mb-1">{t('addressLabel')}</p>
                <p className="font-medium leading-tight">
                  {internalAgent.street1}
                  {internalAgent.street2 ? `, ${internalAgent.street2}` : ''}
                  <br />
                  {internalAgent.city}, {internalAgent.state} {internalAgent.zip}
                </p>
              </div>
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer hover:border-primary/30">
            <input
              type="checkbox"
              checked={internalConsent}
              onChange={(e) => setInternalConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-ink leading-relaxed">
              {t.rich('raInternalConsent', {
                agentName: internalAgent.name,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </span>
          </label>
        </div>
      )}

      {/* External agent form */}
      {!useOurService && (
        <div className="space-y-5 rounded-lg border border-border bg-white p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="raName"
                className={showMissing && !external.name.trim() ? 'text-destructive' : undefined}
              >
                {t('agentName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="raName"
                value={external.name}
                onChange={(e) => setExternal({ ...external, name: e.target.value })}
                placeholder="Jane Doe or Doe Registered Agent Services LLC"
                aria-invalid={showMissing && !external.name.trim()}
                className={
                  showMissing && !external.name.trim()
                    ? 'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive'
                    : undefined
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raEmail" className="flex items-center gap-2">
                {t('agentEmail')}
                <span className="text-xs font-normal text-ink-subtle">{t('optional')}</span>
              </Label>
              <Input
                id="raEmail"
                type="email"
                value={external.email}
                onChange={(e) => setExternal({ ...external, email: e.target.value })}
                placeholder="agent@example.com"
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">
              {t('floridaPhysicalAddress', { state: stateRule.name })}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <AddressForm
              value={external.address}
              onChange={(v) => setExternal({ ...external, address: v })}
              lockedStateCode={stateCode}
              lockedReason={stateRule.addressRules.inStateRequirementNote}
              prefix="ra-"
              highlightMissing={showMissing}
            />
            {external.address.street1 && isPoBox(external.address.street1) && (
              <p className="text-xs text-destructive mt-2">
                {t('poBoxRejection', { state: stateRule.name })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* External RA acceptance signature */}
      {!useOurService && (
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="flex items-start gap-2 text-sm text-ink-muted">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <p>{t('raExternalLegalCopy')}</p>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="signature"
              className={showMissing && !externalSignature.trim() ? 'text-destructive' : undefined}
            >
              {t('raSignatureLabel')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signature"
              aria-invalid={showMissing && !externalSignature.trim()}
              value={externalSignature}
              onChange={(e) => setExternalSignature(e.target.value)}
              placeholder={t('raSignatureLabel')}
              className={cn(
                'font-display text-lg italic',
                showMissing &&
                  !externalSignature.trim() &&
                  'border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive',
              )}
            />
          </div>
        </div>
      )}

      {/* Hardship confirmation dialog */}
      <Dialog open={showHardshipDialog} onOpenChange={setShowHardshipDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              {t('ownAgentConfirmTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-ink">{t('ownAgentConfirmIntro')}</p>
            <ul className="space-y-2">
              {[
                t('ownAgentConfirmHardship1', { state: stateRule.name }),
                t('ownAgentConfirmHardship2'),
                t('ownAgentConfirmHardship3'),
                t('ownAgentConfirmHardship4'),
                t('ownAgentConfirmHardship5'),
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                  <span className="text-ink-muted leading-snug">{line}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1.5">
              <p className="font-medium text-primary text-xs uppercase tracking-wider">
                {t('ownAgentConfirmBenefitsTitle')}
              </p>
              <ul className="space-y-1 text-xs text-ink-muted">
                {[
                  t('ownAgentConfirmBenefit1', { state: stateRule.name }),
                  t('ownAgentConfirmBenefit2'),
                  t('ownAgentConfirmBenefit3'),
                  t('ownAgentConfirmBenefit4'),
                ].map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              onClick={cancelHardshipsKeepLaunchForma}
              size="sm"
            >
              {t('ownAgentConfirmStay')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={acceptHardshipsAndContinue}
              size="sm"
            >
              {t('ownAgentConfirmContinue')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WizardActions
        prevHref={`/wizard/${filing.id}/5`}
        onNext={onContinue}
        nextDisabled={!canContinue}
        onBlocked={() => setShowMissing(true)}
        pending={pending}
      />
    </div>
  );
}
