'use client';

import { useState } from 'react';
import { useLocalizedRouter } from '@/components/i18n/useLocalizedRouter';
import { useLocale, useTranslations } from 'next-intl';
import {
  trackEvent,
  trackGoogleBeginFiling,
  wizardEntitySelectedProperties,
  wizardStep1ContinueProperties,
} from '@/lib/analytics';
import { Building2, Briefcase, Check, MapPin, HelpCircle, Receipt } from 'lucide-react';
import { saveStep1 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { useWizardSubmit } from '../useWizardSubmit';
import { GuestEmailField } from '../GuestEmailField';
import { GuestSignInPrompt } from '../GuestSignInPrompt';
import { cn } from '@/lib/utils';
import {
  ACTIVE_FORMATION_STATES,
  FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';

type EntityChoice = 'LLC' | 'CORP' | 'SCORP';

export function Step1Entity({
  filing,
  needsGuestEmail = false,
  initialGuestEmail = '',
  pendingAccountEmail = '',
  isTester = false,
}: {
  filing: WizardFiling;
  needsGuestEmail?: boolean;
  initialGuestEmail?: string;
  pendingAccountEmail?: string;
  isTester?: boolean;
}) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');
  const locale = useLocale() === 'es' ? 'es' : 'en';
  const isSCorp = filing.taxElection === 'S_CORP';
  const [selected, setSelected] = useState<EntityChoice>(
    isSCorp ? 'SCORP' : (filing.entityType as 'LLC' | 'CORP'),
  );
  // For the S-Corp choice, which legal entity to actually form. Defaults to
  // LLC (the common small-business S-Corp), with Corporation available.
  const [sCorpEntity, setSCorpEntity] = useState<'LLC' | 'CORP'>(
    isSCorp ? (filing.entityType as 'LLC' | 'CORP') : 'LLC',
  );
  const [guestEmail, setGuestEmail] = useState(initialGuestEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(Boolean(pendingAccountEmail));
  const [stateCode, setStateCode] = useState<StateCode>(
    (filing.state && ACTIVE_FORMATION_STATES.includes(filing.state as StateCode)
      ? filing.state
      : 'FL') as StateCode,
  );
  const { pending, error, run } = useWizardSubmit();
  const router = useLocalizedRouter(filing.locale);
  const stateRule = FORMATION_STATES[stateCode];

  const ENTITY_OPTIONS = [
    {
      value: 'LLC' as const,
      title: t('entityLLCTitle'),
      subtitle: 'LLC',
      icon: Building2,
      perks: [t('entityLLCDesc1'), t('entityLLCDesc2'), t('entityLLCDesc3'), t('entityLLCDesc4')],
      recommended: true,
    },
    {
      value: 'CORP' as const,
      title: t('entityCorpTitle'),
      subtitle: 'CORP',
      icon: Briefcase,
      perks: [t('entityCorpDesc1'), t('entityCorpDesc2'), t('entityCorpDesc3'), t('entityCorpDesc4')],
    },
    {
      value: 'SCORP' as const,
      title: t('entitySCorpTitle'),
      subtitle: 'S-CORP',
      icon: Receipt,
      perks: [t('entitySCorpDesc1'), t('entitySCorpDesc2'), t('entitySCorpDesc3'), t('entitySCorpDesc4')],
    },
  ];

  const onContinue = () => {
    trackEvent(
      'wizard_step1_continue_clicked',
      wizardStep1ContinueProperties({
        filingId: filing.id,
        locale,
      }),
    );
    const entityType = selected === 'SCORP' ? sCorpEntity : selected;
    const taxElection = selected === 'SCORP' ? ('S_CORP' as const) : null;
    run(async () => {
      const res = await saveStep1({
        filingId: filing.id,
        entityType,
        state: stateCode,
        taxElection,
        contactEmail: needsGuestEmail ? guestEmail.trim() : undefined,
      });
      if (res && res.ok === false) {
        if (res.needsSignIn) {
          setNeedsSignIn(true);
          setEmailError(null);
          return;
        }
        setNeedsSignIn(false);
        setEmailError(res.error ?? null);
        return res;
      }
      trackGoogleBeginFiling({
        filingId: filing.id,
        isTester,
        isTest: filing.isTest,
        emails: [guestEmail, initialGuestEmail, pendingAccountEmail],
      });
      router.push(`/wizard/${filing.id}/2`);
    });
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        onContinue();
      }}
    >
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div
          id="filing-state-label"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-2"
        >
          <MapPin className="h-3.5 w-3.5" />
          {t('filingState')}
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-labelledby="filing-state-label"
        >
          {ACTIVE_FORMATION_STATES.map((code) => {
            const rule = FORMATION_STATES[code];
            const active = code === stateCode;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStateCode(code)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-ink border-border hover:border-primary/40',
                )}
              >
                <span className="font-mono text-xs">{code}</span>
                {rule.name}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="grid min-w-0 grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={t('entityTypeLabel')}
      >
        {ENTITY_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                setSelected(option.value);
                trackEvent(
                  'wizard_entity_selected',
                  wizardEntitySelectedProperties({
                    filingId: filing.id,
                    locale,
                    entity: option.value,
                  }),
                );
              }}
              className={cn(
                'relative min-w-0 text-left rounded-xl border-2 px-2.5 py-3 transition-all min-h-11',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-white hover:border-primary/30 hover:shadow-card'
              )}
            >
              {option.recommended && (
                <span className="absolute -top-2 left-2 max-w-[calc(100%-0.5rem)] whitespace-nowrap rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  {tPricing('ribbon_recommended')}
                </span>
              )}
              <div className={cn('flex min-w-0 items-start gap-1.5', isSelected && 'pr-5')}>
                <option.icon className={cn('mt-0.5 h-4 w-4 shrink-0', isSelected ? 'text-primary' : 'text-ink-muted')} />
                <span className="min-w-0 break-words font-display text-sm font-medium leading-tight">{option.title}</span>
              </div>
              {isSelected && (
                <Check
                  aria-hidden
                  className="pointer-events-none absolute right-1 top-2 h-3.5 w-3.5 text-primary"
                  strokeWidth={3}
                />
              )}
            </button>
          );
        })}
      </div>

      {selected === 'SCORP' && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div
            id="scorp-entity-label"
            className="text-xs font-semibold uppercase tracking-wider text-primary mb-2"
          >
            {t('sCorpUnderlyingLabel')}
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-labelledby="scorp-entity-label"
          >
            {(['LLC', 'CORP'] as const).map((code) => {
              const active = sCorpEntity === code;
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSCorpEntity(code)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    active
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-ink border-border hover:border-primary/40',
                  )}
                >
                  {code === 'LLC'
                    ? `${t('sCorpUnderlyingLLC')} · ${tPricing('ribbon_recommended')}`
                    : t('sCorpUnderlyingCorp')}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            {t('sCorpUnderlyingHelp')}
          </p>
        </div>
      )}

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
          returnStep={1}
          filingLocale={filing.locale}
        />
      )}

      <WizardActions
        onNext={onContinue}
        pending={pending}
        error={error || emailError}
        isSubmit
        fullWidth
        hideBack
      />

      <div className="space-y-4">
        {ACTIVE_FORMATION_STATES.includes('WY') && stateCode === 'WY' && (
          <p className="text-xs text-ink-muted leading-relaxed">{t('customerNoteWY')}</p>
        )}
        {ACTIVE_FORMATION_STATES.includes('DE') && stateCode === 'DE' && (
          <p className="text-xs text-ink-muted leading-relaxed">{t('customerNoteDE')}</p>
        )}
        {((ACTIVE_FORMATION_STATES.includes('WY') && stateCode === 'WY') ||
          (ACTIVE_FORMATION_STATES.includes('DE') && stateCode === 'DE')) && (
          <p className="text-xs text-ink-muted leading-relaxed">{t('entityHeadsUp', { state: stateRule.name })}</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ENTITY_OPTIONS.map((option) => (
            <ul key={option.value} className="space-y-1.5">
              <li className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {option.title}
              </li>
              {option.perks.map((perk) => (
                <li key={perk} className="text-sm text-ink-muted leading-snug flex items-start gap-2">
                  <span className="text-primary mt-1.5">·</span>
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
        <p className="text-xs text-ink-subtle leading-relaxed">{t('entityHint')}</p>
        <EntityDecisionCard stateName={stateRule.name} />
      </div>
    </form>
  );
}

/**
 * Inline "not sure which to pick?" guidance. The May 2026 SEO/UX audit
 * flagged that LaunchForma had no in-flow decision support - competitors
 * (ZenBusiness, Northwest) embed a comparison card here. This collapsible
 * card surfaces the most common reasons to pick one entity over the
 * other without forcing the visitor to bounce out to a guide page.
 */
function EntityDecisionCard({ stateName }: { stateName: string }) {
  const t = useTranslations('wizard');
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group rounded-xl border border-border bg-white open:bg-primary/5 open:border-primary/30 transition-colors"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex items-center gap-2 cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
        <HelpCircle className="h-4 w-4 text-primary" />
        <span>{t('entityCompareTitle')}</span>
        <span className="ml-auto text-xs text-ink-subtle">
          {open ? t('entityCompareHide') : t('entityCompareShow')}
        </span>
      </summary>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-5">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">
            {t('entityCompareLlcTitle')}
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            {t('entityCompareLlcBody', { state: stateName })}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-1.5">
            {t('entityCompareCorpTitle')}
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            {t('entityCompareCorpBody')}
          </p>
        </div>
        <p className="md:col-span-2 text-xs text-ink-subtle leading-relaxed">
          {t('entityCompareDisclaimer')}
        </p>
      </div>
    </details>
  );
}
