'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Briefcase, Check, MapPin } from 'lucide-react';
import { saveStep1 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { cn } from '@/lib/utils';
import {
  ACTIVE_FORMATION_STATES,
  FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import type { WizardFiling } from '../types';

export function Step1Entity({ filing }: { filing: WizardFiling }) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');
  const [selected, setSelected] = useState<'LLC' | 'CORP'>(filing.entityType as 'LLC' | 'CORP');
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
      subtitle: 'C-Corp',
      icon: Briefcase,
      perks: [t('entityCorpDesc1'), t('entityCorpDesc2'), t('entityCorpDesc3'), t('entityCorpDesc4')],
    },
  ];

  const onContinue = () => {
    start(async () => {
      await saveStep1({ filingId: filing.id, entityType: selected, state: stateCode });
      router.push(`/wizard/${filing.id}/2`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-2">
          <MapPin className="h-3.5 w-3.5" />
          Filing state
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIVE_FORMATION_STATES.map((code) => {
            const rule = FORMATION_STATES[code];
            const active = code === stateCode;
            return (
              <button
                key={code}
                type="button"
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ENTITY_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
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

      <p className="text-xs text-ink-subtle leading-relaxed">{t('entityHint')}</p>

      <WizardActions onNext={onContinue} pending={pending} />
    </div>
  );
}
