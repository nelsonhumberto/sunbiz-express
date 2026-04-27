'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Building2, Info, HelpCircle } from 'lucide-react';
import { saveStep6 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { AddressForm, type AddressValue } from '../AddressForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { safeParseJson, cn } from '@/lib/utils';
import { isPoBox } from '@/lib/florida';
import type { WizardFiling } from '../types';

interface RAStored extends AddressValue {
  type?: string;
  useOurService?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  signature?: string;
}

const INTERNAL_AGENT = {
  name: 'IncServices RA Services LLC',
  email: 'agent@incservices.example',
  phone: '+1 (305) 555-0100',
  street1: '1234 Sunshine Boulevard',
  street2: 'Suite 200',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
};

export function Step6RegisteredAgent({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const tCommon = useTranslations('common');
  const stored = safeParseJson<RAStored | null>(filing.registeredAgent, null);
  const [useOurService, setUseOurService] = useState(stored?.useOurService ?? true);
  const [external, setExternal] = useState({
    name: stored?.useOurService ? '' : stored?.name ?? '',
    email: stored?.useOurService ? '' : stored?.email ?? '',
    phone: stored?.useOurService ? '' : stored?.phone ?? '',
    address: {
      street1: stored?.useOurService ? '' : stored?.street1 ?? '',
      street2: stored?.useOurService ? '' : stored?.street2 ?? '',
      city: stored?.useOurService ? '' : stored?.city ?? '',
      state: 'FL',
      zip: stored?.useOurService ? '' : stored?.zip ?? '',
    } as AddressValue,
  });
  // Internal-RA consent (replaces the typed signature when we are the agent).
  // The customer's appointment of us as RA in this step + payment is the
  // contract; on the document itself we sign as our own legal entity.
  const [internalConsent, setInternalConsent] = useState(
    stored?.useOurService === true && (stored?.signature?.length ?? 0) > 0,
  );
  const [externalSignature, setExternalSignature] = useState(
    stored?.useOurService === false ? stored?.signature ?? '' : '',
  );
  const [showRAHelp, setShowRAHelp] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const externalValid =
    !useOurService &&
    external.name.trim().length > 0 &&
    external.address.street1.trim().length > 0 &&
    external.address.city.trim().length > 0 &&
    external.address.zip.trim().length > 0 &&
    !isPoBox(external.address.street1);

  const canContinue = useOurService
    ? internalConsent
    : externalValid && externalSignature.trim().length >= 2;

  const onContinue = () => {
    start(async () => {
      const payload = useOurService
        ? {
            filingId: filing.id,
            useOurService: true,
            name: INTERNAL_AGENT.name,
            email: INTERNAL_AGENT.email,
            phone: INTERNAL_AGENT.phone,
            street1: INTERNAL_AGENT.street1,
            street2: INTERNAL_AGENT.street2,
            city: INTERNAL_AGENT.city,
            state: 'FL',
            zip: INTERNAL_AGENT.zip,
            // Auto-fill the RA acceptance signature with our entity name.
            // We sign as the agent on the document; the customer's consent
            // toggle above is what authorizes us to do so.
            signature: INTERNAL_AGENT.name,
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
            state: 'FL',
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
      {/* Toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setUseOurService(true)}
          className={cn(
            'relative text-left rounded-2xl border-2 p-5 transition-all',
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
            <li>· {t('useOurAgentP1')}</li>
            <li>· {t('useOurAgentP2')}</li>
            <li>· {t('useOurAgentP3')}</li>
            <li>· {t('useOurAgentP4')}</li>
          </ul>
        </button>

        <button
          type="button"
          onClick={() => setUseOurService(false)}
          className={cn(
            'relative text-left rounded-2xl border-2 p-5 transition-all',
            !useOurService
              ? 'border-primary bg-primary/5 shadow-glow'
              : 'border-border bg-white hover:border-primary/30'
          )}
        >
          <div className="flex items-start gap-3 mb-2">
            <div className="h-11 w-11 rounded-xl bg-muted text-ink-muted flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink">{t('useOwnAgent')}</h3>
              <p className="text-xs text-ink-muted mt-0.5">{t('useOwnAgentDesc')}</p>
            </div>
          </div>
          <ul className="text-xs text-ink-muted space-y-1 mt-2">
            <li>· {t('useOwnAgentP1')}</li>
            <li>· {t('useOwnAgentP2')}</li>
            <li>· {t('useOwnAgentP3')}</li>
            <li>· {t('useOwnAgentP4')}</li>
          </ul>
        </button>
      </div>

      {/* Internal agent display + consent (replaces typed signature) */}
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
                <p className="font-medium">{INTERNAL_AGENT.name}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle uppercase tracking-wider mb-1">{t('addressLabel')}</p>
                <p className="font-medium leading-tight">
                  {INTERNAL_AGENT.street1}, {INTERNAL_AGENT.street2}
                  <br />
                  {INTERNAL_AGENT.city}, {INTERNAL_AGENT.state} {INTERNAL_AGENT.zip}
                </p>
              </div>
            </div>
          </div>
          {/* One-tap consent — we sign on the document on our own behalf. */}
          <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer hover:border-primary/30">
            <input
              type="checkbox"
              checked={internalConsent}
              onChange={(e) => setInternalConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-ink leading-relaxed">
              {t.rich('raInternalConsent', {
                agentName: INTERNAL_AGENT.name,
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
              <Label htmlFor="raName">
                {t('agentName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="raName"
                value={external.name}
                onChange={(e) => setExternal({ ...external, name: e.target.value })}
                placeholder="Jane Doe or Doe Registered Agent Services LLC"
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
              {t('floridaPhysicalAddress')} <span className="text-destructive">*</span>
            </Label>
            <AddressForm
              value={external.address}
              onChange={(v) => setExternal({ ...external, address: v })}
              floridaOnly
              prefix="ra-"
            />
            {external.address.street1 && isPoBox(external.address.street1) && (
              <p className="text-xs text-destructive mt-2">{t('poBoxRejection')}</p>
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
            <Label htmlFor="signature">
              {t('raSignatureLabel')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="signature"
              value={externalSignature}
              onChange={(e) => setExternalSignature(e.target.value)}
              placeholder={t('raSignatureLabel')}
              className="font-display text-lg italic"
            />
          </div>
        </div>
      )}

      <WizardActions
        prevHref={`/wizard/${filing.id}/5`}
        onNext={onContinue}
        nextDisabled={!canContinue}
        pending={pending}
      />
    </div>
  );
}
