'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Briefcase, Check } from 'lucide-react';
import { saveStep1 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { cn } from '@/lib/utils';
import type { WizardFiling } from '../types';

const ENTITY_OPTIONS = [
  {
    value: 'LLC' as const,
    title: 'Limited Liability Company',
    subtitle: 'LLC',
    icon: Building2,
    perks: [
      'Most flexible structure',
      'Pass-through taxation by default',
      'Lower paperwork than corporations',
      '$125 Florida filing fee',
    ],
    recommended: true,
  },
  {
    value: 'CORP' as const,
    title: 'Profit Corporation',
    subtitle: 'C-Corp',
    icon: Briefcase,
    perks: [
      'Best for raising venture capital',
      'Issue stock to shareholders',
      'Optional S-Corp election available',
      '$70 Florida filing fee',
    ],
  },
];

export function Step1Entity({ filing }: { filing: WizardFiling }) {
  const [selected, setSelected] = useState<'LLC' | 'CORP'>(filing.entityType as 'LLC' | 'CORP');
  const [pending, start] = useTransition();
  const router = useRouter();

  const onContinue = () => {
    start(async () => {
      await saveStep1({ filingId: filing.id, entityType: selected });
      router.push(`/wizard/${filing.id}/2`);
    });
  };

  return (
    <div className="space-y-4">
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
                  Most Popular
                </span>
              )}
              <div className="flex items-start gap-3 mb-4">
                <div
                  className={cn(
                    'h-11 w-11 rounded-xl flex items-center justify-center',
                    isSelected
                      ? 'bg-primary text-white'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  <option.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    {option.subtitle}
                  </p>
                  <h3 className="font-display text-xl font-medium leading-tight">
                    {option.title}
                  </h3>
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

      <p className="text-xs text-ink-subtle leading-relaxed">
        💡 Not sure which to choose? Most small business owners start with an LLC. You can elect S-Corp
        tax treatment later for tax savings as your business grows.
      </p>

      <WizardActions onNext={onContinue} pending={pending} />
    </div>
  );
}
