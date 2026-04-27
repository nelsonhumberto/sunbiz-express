'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Sparkles, ShieldCheck, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

interface CostSidebarProps {
  entityType: 'LLC' | 'CORP';
  tier: TierSlug;
  addOnSlugs: AddOnSlug[];
}

export function CostSidebar({ entityType, tier, addOnSlugs }: CostSidebarProps) {
  const t = useTranslations('wizard');
  const breakdown = computeCost({ entityType, tier, addOnSlugs });

  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-primary/5 to-accent/5 px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">
            {t('orderSummary')}
          </h3>
        </div>
      </div>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            {t('filingPackage')}
          </p>
          {breakdown.lines
            .filter((l) => l.category === 'package')
            .map((line) => (
              <CostRow
                key={line.key}
                label={line.label}
                cents={line.cents}
                sublabel={line.detail ?? t('filingFeeIncludedNote')}
              />
            ))}
        </div>

        {breakdown.lines.some((l) => l.category === 'addon') && (
          <div className="space-y-2 pt-3 border-t border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              {t('selectedAddOns')}
            </p>
            {breakdown.lines
              .filter((l) => l.category === 'addon')
              .map((line) => (
                <CostRow
                  key={line.key}
                  label={line.label}
                  cents={line.cents}
                  sublabel={line.detail}
                />
              ))}
          </div>
        )}

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-success-subtle/50 border border-success/20">
          <ShieldCheck className="h-4 w-4 text-success shrink-0 mt-0.5" />
          <div className="text-xs text-ink leading-snug">{t('freeRABanner')}</div>
        </div>

        <motion.div
          key={breakdown.totalCents}
          initial={{ scale: 0.98, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className="pt-4 border-t border-border space-y-1"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{t('totalToday')}</span>
            <span className="font-display text-3xl font-medium">
              {formatCurrency(breakdown.totalCents, { showZero: true })}
            </span>
          </div>
          <p className="text-xs text-ink-subtle">{t('oneTime')}</p>
        </motion.div>

        <Badge variant="secondary" className="w-full justify-center font-medium">
          <Sparkles className="h-3 w-3" />
          {t('cancelAnyAddon')}
        </Badge>
      </CardContent>
    </Card>
  );
}

function CostRow({
  label,
  cents,
  sublabel,
}: {
  label: string;
  cents: number;
  sublabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="text-ink leading-snug">{label}</p>
        {sublabel && <p className="text-xs text-ink-subtle leading-snug">{sublabel}</p>}
      </div>
      <span className="font-medium text-ink shrink-0">
        {formatCurrency(cents, { showZero: true })}
      </span>
    </div>
  );
}
