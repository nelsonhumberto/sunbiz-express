'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, Sparkles } from 'lucide-react';
import { saveStep3 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { TIERS, type TierSlug } from '@/lib/pricing';
import { formatCurrency, cn } from '@/lib/utils';
import type { WizardFiling } from '../types';

export function Step3Tier({ filing }: { filing: WizardFiling }) {
  const [tier, setTier] = useState<TierSlug>(filing.serviceTier as TierSlug);
  const [pending, start] = useTransition();
  const router = useRouter();

  const onContinue = () => {
    start(async () => {
      await saveStep3({ filingId: filing.id, tier });
      router.push(`/wizard/${filing.id}/4`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((t) => {
          const isSelected = tier === t.slug;
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => setTier(t.slug)}
              className={cn(
                'relative text-left rounded-2xl border-2 p-5 transition-all flex flex-col',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-white hover:border-primary/30 hover:shadow-card'
              )}
            >
              {t.recommended && (
                <span className="absolute -top-3 left-5 px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  Recommended
                </span>
              )}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-display text-xl font-medium">{t.name}</h3>
                  <p className="font-display text-3xl font-medium mt-1">
                    {t.basePriceCents === 0 ? '$0' : formatCurrency(t.basePriceCents)}
                  </p>
                  <p className="text-xs text-ink-subtle">+ state fees</p>
                </div>
                {isSelected && (
                  <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted mb-4 leading-snug">{t.description}</p>
              <ul className="space-y-1.5 flex-1">
                {t.features.slice(0, 6).map((f) => (
                  <li
                    key={f.label}
                    className={cn(
                      'flex items-start gap-2 text-xs leading-snug',
                      !f.included && 'text-ink-subtle'
                    )}
                  >
                    {f.included ? (
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 mt-0.5',
                          f.highlight ? 'text-accent' : 'text-primary'
                        )}
                        strokeWidth={3}
                      />
                    ) : (
                      <Minus className="h-3.5 w-3.5 shrink-0 mt-0.5 text-ink-subtle" />
                    )}
                    <span className={f.highlight ? 'font-semibold text-ink' : ''}>{f.label}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/2`}
        onNext={onContinue}
        pending={pending}
      />
    </div>
  );
}
