'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Briefcase, Check, MapPin, HelpCircle, Receipt } from 'lucide-react';
import { saveStep1 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { cn } from '@/lib/utils';
import {
  ACTIVE_FORMATION_STATES,
  FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';

type EntityChoice = 'LLC' | 'CORP' | 'SCORP';

export function Step1Entity({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');
  const isSCorp = filing.taxElection === 'S_CORP';
  const [selected, setSelected] = useState<EntityChoice>(
    isSCorp ? 'SCORP' : (filing.entityType as 'LLC' | 'CORP'),
  );
  // For the S-Corp choice, which legal entity to actually form. Defaults to
  // LLC (the common small-business S-Corp), with Corporation available.
  const [sCorpEntity, setSCorpEntity] = useState<'LLC' | 'CORP'>(
    isSCorp ? (filing.entityType as 'LLC' | 'CORP') : 'LLC',
  );
  const [stateCode, setStateCode] = useState<StateCode>(
    (filing.state && ACTIVE_FORMATION_STATES.includes(filing.state as StateCode)
      ? filing.state
      : 'FL') as StateCode,
  );
  const [pending, start] = useTransition();
  const router = useRouter();
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
    const entityType = selected === 'SCORP' ? sCorpEntity : selected;
    const taxElection = selected === 'SCORP' ? ('S_CORP' as const) : null;
    start(async () => {
      await saveStep1({ filingId: filing.id, entityType, state: stateCode, taxElection });
      router.push(`/wizard/${filing.id}/2`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div
          id="filing-state-label"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-2"
        >
          <MapPin className="h-3.5 w-3.5" />
          Filing state
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
        {stateRule.quirks.customerNote && (
          <p className="mt-3 text-xs text-ink-muted leading-relaxed">
            {stateRule.quirks.customerNote}
          </p>
        )}
        {(stateRule.code === 'WY' || stateRule.code === 'DE') && (
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            <strong>Heads up:</strong> Forming in {stateRule.name} doesn't authorize you to do
            business in another state. If you'll have an office, employees, or significant
            operations elsewhere, that state usually requires a separate "foreign qualification"
            filing. We'll ask about this later in the wizard and follow up after formation.
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        role="radiogroup"
        aria-label="Entity type"
      >
        {ENTITY_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(option.value)}
              className={cn(
                'relative text-left rounded-2xl border-2 p-6 transition-all',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-white hover:border-primary/30 hover:shadow-card'
              )}
            >
              {option.recommended && (
                <span className="absolute -top-3 left-6 px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-semibold uppercase tracking-wider">
                  {tPricing('ribbon_recommended')}
                </span>
              )}
              <div className="flex items-start gap-3 mb-4">
                <div
                  className={cn(
                    'h-11 w-11 rounded-xl flex items-center justify-center',
                    isSelected ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
                  )}
                >
                  <option.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    {option.subtitle}
                  </p>
                  <h3 className="font-display text-xl font-medium leading-tight">{option.title}</h3>
                </div>
                {isSelected && (
                  <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {option.perks.map((perk) => (
                  <li key={perk} className="text-sm text-ink-muted leading-snug flex items-start gap-2">
                    <span className="text-primary mt-1.5">·</span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
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

      <p className="text-xs text-ink-subtle leading-relaxed">{t('entityHint')}</p>

      <EntityDecisionCard stateName={stateRule.name} />

      <WizardActions onNext={onContinue} pending={pending} />
    </div>
  );
}

/**
 * Inline "not sure which to pick?" guidance. The May 2026 SEO/UX audit
 * flagged that LaunchForma had no in-flow decision support — competitors
 * (ZenBusiness, Northwest) embed a comparison card here. This collapsible
 * card surfaces the most common reasons to pick one entity over the
 * other without forcing the visitor to bounce out to a guide page.
 */
function EntityDecisionCard({ stateName }: { stateName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group rounded-xl border border-border bg-white open:bg-primary/5 open:border-primary/30 transition-colors"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex items-center gap-2 cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">
        <HelpCircle className="h-4 w-4 text-primary" />
        <span>Not sure? LLC vs Corporation in 30 seconds</span>
        <span className="ml-auto text-xs text-ink-subtle">
          {open ? 'Hide' : 'Show'}
        </span>
      </summary>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-5">
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">
            Pick LLC
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Most small businesses. Pass-through taxation by default (profits
            taxed once, on your personal return), flexible management, simpler
            ongoing compliance, and strong asset protection. Best for
            solopreneurs, real-estate holdings, consulting, and most service
            businesses in {stateName}.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-1.5">
            Pick Corporation
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Best if you plan to raise venture capital, issue stock to
            employees, or operate a regulated business that requires a corp
            structure. C-Corps face double taxation by default; S-Corp
            election (we offer the filing) can reduce self-employment tax for
            profitable owner-operated businesses.
          </p>
        </div>
        <p className="md:col-span-2 text-xs text-ink-subtle leading-relaxed">
          LaunchForma is not a law firm and this is general guidance, not tax
          or legal advice. For complex situations (multiple owners with
          different interests, raising outside capital, professional
          licensing), talk to a CPA or attorney before filing.
        </p>
      </div>
    </details>
  );
}
