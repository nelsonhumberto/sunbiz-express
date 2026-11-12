'use client';

import { useState } from 'react';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { useTranslations } from 'next-intl';
import { Check, MapPin, ShieldCheck } from 'lucide-react';
import { saveStep4, saveStep5, saveStep6 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { useWizardSubmit } from '../useWizardSubmit';
import { AddressForm, type AddressValue } from '../AddressForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeParseJson, cn, formatCurrency } from '@/lib/utils';
import { WIZARD_ACTION_TIMEOUT_MS } from '@/lib/action-timeout';
import { isPoBox } from '@/lib/formation-validation';
import {
  isActiveFormationState,
  getFormationState,
  type StateCode,
} from '@/lib/formation-states';
import { initialUseOurRegisteredAgent } from '@/lib/registered-agent-choice';
import type { WizardFiling } from '../types';

type StoredPrincipal = AddressValue & { noFloridaAddress?: boolean };

interface RAStored extends AddressValue {
  useOurService?: boolean;
  name?: string;
  email?: string;
  phone?: string;
  signature?: string;
}

/**
 * Landing-draft screen for principal address, mailing address, and
 * registered agent. Mailing starts as the same address. LaunchForma
 * starts selected. Both can be changed on this screen.
 */
export function LpSetupStep({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const filingState: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateRule = getFormationState(filingState);
  const internalAgent = stateRule.registeredAgent;
  const raPrice = formatCurrency(internalAgent.renewalCents);

  const parsed = safeParseJson<StoredPrincipal>(filing.principalAddress, {
    street1: '',
    city: '',
    state: filingState,
    zip: '',
  });
  const [address, setAddress] = useState<AddressValue>({
    street1: parsed.street1 ?? '',
    street2: parsed.street2,
    city: parsed.city ?? '',
    state: parsed.state || filingState,
    zip: parsed.zip ?? '',
    inCareOf: parsed.inCareOf,
  });
  const [noFloridaAddress, setNoFloridaAddress] = useState(parsed.noFloridaAddress === true);

  const storedMail = safeParseJson<unknown>(filing.mailingAddress, null);
  const initialSame = storedMail === 'SAME_AS_PRINCIPAL' || storedMail === null;
  const initialMail: AddressValue =
    !initialSame && typeof storedMail === 'object' && storedMail !== null
      ? (storedMail as AddressValue)
      : { street1: '', city: '', state: filingState, zip: '' };
  const [sameAsPrincipal, setSame] = useState(initialSame);
  const [mailing, setMailing] = useState<AddressValue>(initialMail);

  const storedRa = safeParseJson<RAStored | null>(filing.registeredAgent, null);
  const [useOurService, setUseOurService] = useState(
    initialUseOurRegisteredAgent(storedRa?.useOurService),
  );
  const [internalConsent, setInternalConsent] = useState(
    storedRa?.useOurService === true && (storedRa?.signature?.length ?? 0) > 0,
  );
  const [external, setExternal] = useState({
    name: storedRa?.useOurService ? '' : (storedRa?.name ?? ''),
    email: storedRa?.useOurService ? '' : (storedRa?.email ?? ''),
    phone: storedRa?.useOurService ? '' : (storedRa?.phone ?? ''),
    address: {
      street1: storedRa?.useOurService ? '' : (storedRa?.street1 ?? ''),
      street2: storedRa?.useOurService ? '' : (storedRa?.street2 ?? ''),
      city: storedRa?.useOurService ? '' : (storedRa?.city ?? ''),
      state: filingState,
      zip: storedRa?.useOurService ? '' : (storedRa?.zip ?? ''),
    } as AddressValue,
  });
  const [externalSignature, setExternalSignature] = useState(
    storedRa?.useOurService === false ? (storedRa?.signature ?? '') : '',
  );
  const [showMissing, setShowMissing] = useState(false);
  const { pending, error, run } = useWizardSubmit();
  const router = useLocalizedRouter(filing.locale);

  const showInStateChoice = stateRule.addressRules.registeredAgentAddressMustBeInState;
  const principalFilled = Boolean(
    address.street1.trim() && address.city.trim() && address.state && address.zip.trim(),
  );
  const mailingFilled = Boolean(
    sameAsPrincipal ||
      (mailing.street1.trim() && mailing.city.trim() && mailing.state && mailing.zip.trim()),
  );
  const externalValid =
    !useOurService &&
    external.name.trim().length > 0 &&
    external.address.street1.trim().length > 0 &&
    external.address.city.trim().length > 0 &&
    external.address.zip.trim().length > 0 &&
    external.address.state.toUpperCase() === filingState &&
    !isPoBox(external.address.street1);
  const agentValid = useOurService ? internalConsent : externalValid && externalSignature.trim().length >= 2;
  const valid = principalFilled && mailingFilled && agentValid;

  const onContinue = () => {
    run(async () => {
      const principal = await saveStep4({
        filingId: filing.id,
        address,
        noFloridaAddress: showInStateChoice ? noFloridaAddress : false,
      });
      if (!principal.ok) return principal;
      const mail = await saveStep5({
        filingId: filing.id,
        sameAsPrincipal,
        address: sameAsPrincipal ? undefined : mailing,
      });
      if (!mail.ok) return mail;
      const agent = await saveStep6(
        useOurService
          ? {
              filingId: filing.id,
              useOurService: true,
              name: internalAgent.name,
              email: internalAgent.email,
              phone: internalAgent.phone,
              street1: internalAgent.street1,
              street2: internalAgent.street2,
              city: internalAgent.city,
              state: filingState,
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
              state: filingState,
              zip: external.address.zip,
              signature: externalSignature,
            },
      );
      if (!agent.ok) return agent;
      router.push(`/wizard/${filing.id}/7`);
      return agent;
    }, WIZARD_ACTION_TIMEOUT_MS);
  };

  return (
    <div className="space-y-6">
      {showInStateChoice && (
        <div
          role="radiogroup"
          aria-label={t('addressChoiceLegend', { state: stateRule.name })}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!noFloridaAddress}
            onClick={() => setNoFloridaAddress(false)}
            className={cn(
              'text-left rounded-2xl border-2 p-4 transition-all',
              !noFloridaAddress
                ? 'border-primary bg-primary/5 shadow-glow'
                : 'border-border bg-white hover:border-primary/30',
            )}
          >
            <p className="font-semibold text-ink leading-snug">
              {t('hasInStateAddress', { state: stateRule.name })}
            </p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={noFloridaAddress}
            onClick={() => setNoFloridaAddress(true)}
            className={cn(
              'text-left rounded-2xl border-2 p-4 transition-all',
              noFloridaAddress
                ? 'border-primary bg-primary/5 shadow-glow'
                : 'border-border bg-white hover:border-primary/30',
            )}
          >
            <p className="font-semibold text-ink leading-snug flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              {t('noInStateAddress', { state: stateRule.name })}
            </p>
          </button>
        </div>
      )}

      <AddressForm
        value={address}
        onChange={setAddress}
        showInCareOf
        defaultStateCode={filingState}
        highlightMissing={showMissing}
      />

      <label className="flex items-start gap-3 rounded-2xl border-2 border-border bg-white p-4 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          checked={sameAsPrincipal}
          onChange={(event) => setSame(event.target.checked)}
        />
        <span>
          <span className="font-semibold text-ink flex items-center gap-2">
            {sameAsPrincipal ? <Check className="h-4 w-4 text-primary" /> : <MapPin className="h-4 w-4 text-ink-muted" />}
            {t('mailingSame')}
          </span>
          <span className="block text-xs text-ink-muted mt-1">{t('mailingDifferentHint')}</span>
        </span>
      </label>

      {!sameAsPrincipal && (
        <div className="space-y-3">
          <Label className="text-base">{t('mailingAddressLabel')}</Label>
          <AddressForm
            value={mailing}
            onChange={setMailing}
            defaultStateCode={filingState}
            highlightMissing={showMissing}
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">{t('registeredAgent')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            aria-pressed={useOurService}
            onClick={() => setUseOurService(true)}
            className={cn(
              'text-left rounded-2xl border-2 p-4 transition-all',
              useOurService
                ? 'border-primary bg-primary/5 shadow-glow'
                : 'border-border bg-white hover:border-primary/30',
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('freeYearBadge')}</p>
            <p className="font-semibold text-ink mt-1">{t('useOurAgent')}</p>
            <p className="text-xs text-ink-muted mt-1">{t('useOurAgentP3', { price: raPrice })}</p>
          </button>
          <button
            type="button"
            aria-pressed={!useOurService}
            onClick={() => setUseOurService(false)}
            className={cn(
              'text-left rounded-2xl border-2 p-4 transition-all',
              !useOurService
                ? 'border-primary bg-primary/5 shadow-glow'
                : 'border-border bg-white hover:border-primary/30',
            )}
          >
            <p className="font-semibold text-ink">{t('useOwnAgent')}</p>
            <p className="text-xs text-ink-muted mt-1">{t('useOwnAgentDesc')}</p>
          </button>
        </div>

        {useOurService ? (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={internalConsent}
              onChange={(event) => setInternalConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-ink leading-relaxed">
              {t.rich('raInternalConsent', {
                agentName: internalAgent.name,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </span>
          </label>
        ) : (
          <div className="space-y-4 rounded-lg border border-border bg-white p-4">
            <div className="space-y-1.5">
              <Label htmlFor="lp-ra-name">
                {t('agentName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lp-ra-name"
                value={external.name}
                onChange={(event) => setExternal({ ...external, name: event.target.value })}
              />
            </div>
            <AddressForm
              value={external.address}
              onChange={(next) => setExternal({ ...external, address: next })}
              lockedStateCode={filingState}
              prefix="lp-ra-"
              highlightMissing={showMissing}
            />
            {external.address.street1 && isPoBox(external.address.street1) ? (
              <p className="text-xs text-destructive">{t('poBoxRejection', { state: stateRule.name })}</p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="lp-ra-signature">
                {t('raSignatureLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lp-ra-signature"
                value={externalSignature}
                onChange={(event) => setExternalSignature(event.target.value)}
                className="font-display text-lg italic"
              />
            </div>
          </div>
        )}
      </div>

      {showMissing && !valid ? <p className="text-sm text-destructive">{t('missingFields')}</p> : null}

      <WizardActions
        prevHref={`/wizard/${filing.id}/2`}
        onNext={onContinue}
        nextDisabled={!valid}
        onBlocked={() => setShowMissing(true)}
        pending={pending}
        error={error}
      />
    </div>
  );
}
