'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Hash,
  FileText,
  Users,
  Globe,
  Award,
  FileCheck,
  CalendarCheck,
  Receipt,
  BellRing,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { saveStep11 } from '@/actions/wizard';
import { WizardActions } from '../WizardShell';
import { Badge } from '@/components/ui/badge';
import { ADD_ONS, type AddOnSlug, type TierSlug, tierBundledAddOns } from '@/lib/pricing';
import { formatCurrency, cn } from '@/lib/utils';
import type { WizardFiling } from '../types';

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck,
  Hash,
  FileText,
  Users,
  Globe,
  Award,
  FileCheck,
  CalendarCheck,
  Receipt,
  BellRing,
};

export function Step11AddOns({ filing }: { filing: WizardFiling }) {
  const tier = filing.serviceTier as TierSlug;
  const bundled = new Set(tierBundledAddOns(tier));

  const initialSelected = new Set(
    filing.filingAdditionalServices.map((fas) => fas.service.serviceSlug)
  );
  // Always include registered_agent (free Y1) baseline
  initialSelected.add('registered_agent');

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = (slug: string) => {
    if (slug === 'registered_agent') return; // mandatory baseline
    if (bundled.has(slug as AddOnSlug)) return; // bundled - not toggleable
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const onContinue = () => {
    start(async () => {
      const res = await saveStep11({
        filingId: filing.id,
        addOnSlugs: Array.from(selected),
      });
      if (!res.ok) return;
      router.push(`/wizard/${filing.id}/12`);
    });
  };

  // Sort add-ons: highlight (RA) first, then by category
  const sorted = [...ADD_ONS].sort((a, b) => {
    if (a.slug === 'registered_agent') return -1;
    if (b.slug === 'registered_agent') return 1;
    const catOrder = { formation: 0, compliance: 1, branding: 2 } as const;
    return catOrder[a.category] - catOrder[b.category];
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((addon) => {
          const isSelected = selected.has(addon.slug);
          const isBundled = bundled.has(addon.slug);
          const isMandatory = addon.slug === 'registered_agent';
          const Icon = ICONS[addon.iconKey] ?? FileText;

          return (
            <button
              key={addon.slug}
              type="button"
              onClick={() => toggle(addon.slug)}
              disabled={isBundled || isMandatory}
              className={cn(
                'relative text-left rounded-lg border-2 p-5 transition-all flex flex-col gap-3',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-white hover:border-primary/30 hover:shadow-card',
                (isBundled || isMandatory) && 'cursor-default'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
                    isSelected
                      ? addon.highlight
                        ? 'bg-success text-white'
                        : 'bg-primary text-white'
                      : addon.highlight
                        ? 'bg-success/10 text-success'
                        : 'bg-primary/10 text-primary'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-ink leading-tight">{addon.name}</h3>
                    {isBundled && <Badge variant="success" size="sm">Included in {tier}</Badge>}
                    {!isBundled && addon.badge && <Badge variant="success" size="sm">{addon.badge}</Badge>}
                  </div>
                </div>
                {isSelected && (
                  <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </div>

              <p className="text-sm text-ink-muted leading-relaxed">{addon.description}</p>

              <div className="flex items-baseline justify-between">
                <span className="font-display text-2xl font-medium text-ink">
                  {isBundled ? 'Included' : formatCurrency(addon.priceCents, { showZero: true })}
                </span>
                {addon.recurring && (
                  <span className="text-xs text-ink-subtle">/ {addon.recurring}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <WizardActions
        prevHref={`/wizard/${filing.id}/10`}
        onNext={onContinue}
        pending={pending}
        nextLabel="Review payment"
      />
    </div>
  );
}
