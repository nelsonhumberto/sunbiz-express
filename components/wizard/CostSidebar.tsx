'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Sparkles, ShieldCheck, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  computeCost,
  type AddOnSlug,
  type CostBreakdownLine,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import { addOnNameKey, recurringKey } from '@/lib/pricing-i18n';
import { formatCurrency } from '@/lib/utils';

interface CostSidebarProps {
  entityType: 'LLC' | 'CORP';
  tier: TierSlug;
  addOnSlugs: AddOnSlug[];
}

export function CostSidebar({ entityType, tier, addOnSlugs }: CostSidebarProps) {
  const t = useTranslations('wizard');
  const tPricing = useTranslations('pricing');
  const breakdown = computeCost({ entityType, tier, addOnSlugs });

  const labelFor = (line: CostBreakdownLine) =>
    localizedLineLabel(line, entityType, t, tPricing);
  const detailFor = (line: CostBreakdownLine) =>
    localizedLineDetail(line, t);

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
                label={labelFor(line)}
                cents={line.cents}
                sublabel={detailFor(line) ?? t('filingFeeIncludedNote')}
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
                  label={labelFor(line)}
                  cents={line.cents}
                  sublabel={detailFor(line)}
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

/**
 * Translates a `CostBreakdownLine` label into the user's locale. The line
 * itself stays English (server actions and PDFs reuse it verbatim) — we just
 * pick the matching i18n key when rendering for the customer.
 */
export function localizedLineLabel(
  line: CostBreakdownLine,
  entityType: EntityType,
  tWizard: (key: string, vars?: Record<string, string | number>) => string,
  tPricing: (key: string) => string,
): string {
  if (line.category === 'package' && line.tierSlug) {
    return tWizard('packageLineLabel', {
      tierName: tPricing(`tier_${line.tierSlug}`),
      entityShort:
        entityType === 'LLC' ? tWizard('entityShortLLC') : tWizard('entityShortCorp'),
    });
  }
  if (line.category === 'addon' && line.addOnSlug) {
    return tWizard(addOnNameKey(line.addOnSlug));
  }
  return line.label;
}

/**
 * Translates the optional sub-label beneath a line. For add-ons it's the
 * cadence ("Annual subscription"); for packages we leave it null so the
 * caller can fall back to the generic "filing fee included" note.
 */
export function localizedLineDetail(
  line: CostBreakdownLine,
  tWizard: (key: string) => string,
): string | undefined {
  if (line.category === 'addon' && line.recurring) {
    const key = recurringKey(line.recurring);
    if (key) return tWizard(key);
  }
  return undefined;
}
