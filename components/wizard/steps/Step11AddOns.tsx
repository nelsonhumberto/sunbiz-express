'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
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
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { saveStep11, upgradeTier } from '@/actions/wizard';
import { Badge } from '@/components/ui/badge';
import {
  ADD_ONS,
  addOnPriceCents,
  computeCost,
  preferredOperatingAgreementSlug,
  tierBundledAddOns,
  type AddOnSlug,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import {
  addOnBadgeKey,
  addOnDescKey,
  addOnNameKey,
} from '@/lib/pricing-i18n';
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
  const t = useTranslations('wizard');
  const tCommon = useTranslations('common');
  const tPricing = useTranslations('pricing');
  const [tier, setTier] = useState<TierSlug>(filing.serviceTier as TierSlug);
  const entityType = filing.entityType as EntityType;
  const bundled = new Set(tierBundledAddOns(tier));
  const tierName = tPricing(`tier_${tier}` as never);

  // Pick the right Operating Agreement card based on the recorded member
  // count. We hide the other variant entirely so users don't have two OA
  // line items competing.
  const memberCount = filing.managersMembers.length || 1;
  const preferredOA = preferredOperatingAgreementSlug(memberCount);
  const oppositeOA: AddOnSlug =
    preferredOA === 'operating_agreement_single'
      ? 'operating_agreement_multi'
      : 'operating_agreement_single';

  const initialSelected = new Set(
    filing.filingAdditionalServices.map((fas) => fas.service.serviceSlug),
  );
  initialSelected.add('registered_agent');

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [pending, start] = useTransition();
  const [upgrading, startUpgrade] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Honour `?addon=...` deep links from upsell cards so the recommendation
  // shows up already toggled on.
  useEffect(() => {
    const requestedAddon = searchParams?.get('addon');
    if (!requestedAddon) return;
    setSelected((prev) => {
      if (prev.has(requestedAddon)) return prev;
      const next = new Set(prev);
      next.add(requestedAddon);
      return next;
    });
  }, [searchParams]);

  // Compare the customer's current selection against the next tier up. If the
  // tier upgrade would cost less than the equivalent à la carte add-ons, show
  // a one-tap upsell card. Only triggers for BASIC and STANDARD; PREMIUM has
  // no upgrade target.
  const upgradeTarget: TierSlug | null =
    tier === 'BASIC' ? 'STANDARD' : tier === 'STANDARD' ? 'PREMIUM' : null;
  const currentCost = computeCost({
    entityType,
    tier,
    addOnSlugs: Array.from(selected) as AddOnSlug[],
  });
  const upgradedCost = upgradeTarget
    ? computeCost({
        entityType,
        tier: upgradeTarget,
        addOnSlugs: Array.from(selected) as AddOnSlug[],
      })
    : null;
  // Only surface the prompt when the upgrade would actually save money.
  const upgradeSavingsCents = upgradedCost
    ? currentCost.totalCents - upgradedCost.totalCents
    : 0;
  const showUpgradeHint = upgradeTarget && upgradeSavingsCents > 0;

  const onUpgrade = () => {
    if (!upgradeTarget) return;
    startUpgrade(async () => {
      const res = await upgradeTier({ filingId: filing.id, tier: upgradeTarget });
      if (!res.ok) {
        toast.error(t('errorSaveGeneric'));
        return;
      }
      setTier(upgradeTarget);
      toast.success(
        t('tierUpgraded', { tier: tPricing(`tier_${upgradeTarget}` as never) }),
      );
      router.refresh();
    });
  };

  const toggle = (slug: string) => {
    if (slug === 'registered_agent') return;
    if (bundled.has(slug as AddOnSlug)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      // Keep only one OA variant selected at a time.
      if (slug === 'operating_agreement_single' && next.has('operating_agreement_single')) {
        next.delete('operating_agreement_multi');
      } else if (slug === 'operating_agreement_multi' && next.has('operating_agreement_multi')) {
        next.delete('operating_agreement_single');
      }
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
      router.push(`/wizard/${filing.id}/11`);
    });
  };

  // "Skip" persists the bundled-only selection (registered agent stays
  // because it is mandatory) and jumps straight to payment.
  const onSkip = () => {
    start(async () => {
      const baseline = new Set<string>(['registered_agent']);
      tierBundledAddOns(tier).forEach((slug) => baseline.add(slug));
      const res = await saveStep11({
        filingId: filing.id,
        addOnSlugs: Array.from(baseline),
      });
      if (!res.ok) return;
      router.push(`/wizard/${filing.id}/11`);
    });
  };

  // Build a tiny recommendation list driven by the customer's earlier
  // answers. Only surfaces items that aren't already bundled into the chosen
  // tier and aren't already selected. The banner intentionally caps at two
  // recommendations to avoid the LegalZoom-style upsell wall.
  const recommendations: Array<{ slug: AddOnSlug; reasonKey: string }> = [];
  if (!bundled.has('ein') && !selected.has('ein')) {
    recommendations.push({ slug: 'ein', reasonKey: 'addOnsBannerEinReason' });
  }
  if (
    entityType === 'LLC' &&
    memberCount > 1 &&
    !bundled.has('operating_agreement_multi') &&
    !selected.has('operating_agreement_multi')
  ) {
    recommendations.push({
      slug: 'operating_agreement_multi',
      reasonKey: 'addOnsBannerOaReason',
    });
  }
  const trimmedRecommendations = recommendations.slice(0, 2);

  // Filter & sort add-ons:
  //  - hide CORP-irrelevant items (OA add-ons are LLC-only)
  //  - hide the "wrong" OA variant for the recorded member count
  //  - registered_agent first, then by category
  const visible = ADD_ONS.filter((a) => {
    if (
      entityType === 'CORP' &&
      (a.slug === 'operating_agreement_single' || a.slug === 'operating_agreement_multi')
    ) {
      return false;
    }
    if (a.slug === oppositeOA) return false;
    return true;
  });
  const sorted = [...visible].sort((a, b) => {
    if (a.slug === 'registered_agent') return -1;
    if (b.slug === 'registered_agent') return 1;
    const catOrder = { formation: 0, compliance: 1, branding: 2 } as const;
    return catOrder[a.category] - catOrder[b.category];
  });

  return (
    <div className="space-y-5">
      {showUpgradeHint && upgradeTarget && (() => {
        const upgradeName = tPricing(`tier_${upgradeTarget}` as never);
        return (
          <div className="rounded-2xl border-2 border-success/30 bg-gradient-to-br from-success-subtle/60 via-white to-white p-5 flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-success text-white flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-success font-semibold">
                {t('tierUpsellEyebrow')}
              </p>
              <p className="font-semibold text-ink mt-0.5">
                {t('tierUpsellHeadline', {
                  tier: upgradeName,
                  amount: formatCurrency(upgradeSavingsCents, { showZero: true }),
                })}
              </p>
              <p className="text-sm text-ink-muted mt-1">{t('tierUpsellBody')}</p>
            </div>
            <button
              type="button"
              onClick={onUpgrade}
              disabled={upgrading}
              className="bg-success text-white px-4 py-2 rounded-md font-semibold hover:bg-success/90 transition-colors text-sm disabled:opacity-60 shrink-0"
            >
              {upgrading ? t('saving') : t('tierUpsellCta', { tier: upgradeName })}
            </button>
          </div>
        );
      })()}

      {trimmedRecommendations.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t('addOnsRecommendedEyebrow')}
            </p>
          </div>
          <p className="font-semibold text-ink">{t('addOnsRecommendedHeadline')}</p>
          <p className="text-sm text-ink-muted mt-1">{t('addOnsRecommendedBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {trimmedRecommendations.map((rec) => {
              const addon = ADD_ONS.find((a) => a.slug === rec.slug);
              if (!addon) return null;
              return (
                <button
                  key={rec.slug}
                  type="button"
                  onClick={() => toggle(rec.slug)}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-white transition-colors"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                  {t(addOnNameKey(addon.slug))} ·{' '}
                  {formatCurrency(addOnPriceCents(addon.slug, entityType))}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                    <h3 className="font-semibold text-ink leading-tight">
                      {t(addOnNameKey(addon.slug))}
                    </h3>
                    {isBundled && (
                      <Badge variant="success" size="sm">
                        {t('addOnIncludedInTier', { tier: tierName })}
                      </Badge>
                    )}
                    {!isBundled &&
                      (() => {
                        const badgeKey = addOnBadgeKey(addon.slug);
                        if (!badgeKey) return null;
                        return (
                          <Badge variant="success" size="sm">
                            {t(badgeKey)}
                          </Badge>
                        );
                      })()}
                  </div>
                </div>
                {isSelected && (
                  <span className="h-6 w-6 rounded-full bg-primary text-white flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </div>

              <p className="text-sm text-ink-muted leading-relaxed">
                {t(addOnDescKey(addon.slug))}
              </p>

              <div className="flex items-baseline justify-between">
                <span className="font-display text-2xl font-medium text-ink">
                  {isBundled
                    ? t('addOnIncluded')
                    : formatCurrency(addOnPriceCents(addon.slug, entityType), { showZero: true })}
                </span>
                {addon.recurring === 'annually' && (
                  <span className="text-xs text-ink-subtle">{t('perAnnual')}</span>
                )}
                {addon.recurring === 'monthly' && (
                  <span className="text-xs text-ink-subtle">{t('perMonthly')}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-10 pt-6 border-t border-border flex items-center justify-between gap-4">
        <Link
          href={`/wizard/${filing.id}/9`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={pending}
            className="text-sm font-medium text-ink-muted hover:text-ink underline-offset-4 hover:underline transition-colors disabled:opacity-50"
          >
            {t('addOnsSkipToPayment')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-2 h-12 px-8 rounded-lg text-base font-semibold transition-all',
              'bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-md active:scale-[0.98]',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
            )}
          >
            {pending ? tCommon('saving') : t('reviewPayment')}
            {!pending && <span className="text-lg leading-none">→</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
