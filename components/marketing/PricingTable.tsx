'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Check, Minus, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  TIERS,
  tierIncludesCertificateFees,
  tierPackagePriceCents,
  tierPriceParts,
  type TierSlug,
} from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { feeSplitLabel } from '@/components/marketing/fee-split';
import { hrefWithAttribution } from '@/lib/preserve-attribution';
import { cn } from '@/lib/utils';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';
import { getFormationState, isActiveFormationState } from '@/lib/formation-states';
import { trackCtaClicked } from '@/lib/analytics';

interface PricingTableProps {
  showHeader?: boolean;
  className?: string;
  /** Resolved marketing state (controls the per-state footnote). */
  state?: MarketingState;
  /** Optional note under the fee footnote. Used on /pricing for the Florida $160 breakdown. */
  feeNote?: string;
  /** Optional link under the fee note. Used on /pricing for the state-fee guide. */
  feeNoteLink?: { href: string; label: string };
  /** Current page query, so plan links keep utm and gclid on the first paint. */
  attributionSearch?: string;
}

const FEATURE_KEYS: Record<string, string> = {
  'Florida filing fee included': 'feat_floridaFee',
  'State filing fee included': 'feat_floridaFee',
  'Articles of Organization / Incorporation prepared & submitted': 'feat_articles',
  'Same-business-day filing': 'feat_sameDay',
  'Filing within 1 business day': 'feat_sameDay',
  'Same-business-day preparation and submission': 'feat_sameDayPrep',
  'Preparation and submission within 1 business day': 'feat_sameDayPrep',
  'Free Year-1 Registered Agent': 'feat_freeRA',
  'Email support': 'feat_emailSupport',
  'Operating Agreement (custom)': 'feat_oa',
  'Operating Agreement (add-on)': 'feat_oaAddOn',
  'Certified Copy of Articles': 'feat_certCopy',
  'Certificate of Status (state-issued)': 'feat_certStatus',
  'Priority email support': 'feat_chatSupport',
  'Free .com domain (year 1)': 'feat_domainConcierge',
  'Compliance Alerts Plus (year 1)': 'feat_complianceAlerts',
  'Priority phone & email support': 'feat_phoneSupport',
  'S-Corp Election guidance': 'feat_scorp',
  'Banking resolution template': 'feat_banking',
  'Business email setup': 'feat_email',
  'Quarterly compliance check-ins': 'feat_quarterly',
  'Everything in Filing Only': 'feat_everythingBasic',
  'Everything in Basic Filing': 'feat_everythingBasic',
  'Everything in Bank-Ready Filing': 'feat_everythingBankReady',
  'Everything in Popular': 'feat_everythingBankReady',
  'S-Corp Election filing (Form 2553)': 'feat_scorpFiling',
};

export function PricingTable({
  showHeader = true,
  className,
  state = FLORIDA,
  feeNote,
  feeNoteLink,
  attributionSearch: attributionFromServer = '',
}: PricingTableProps) {
  const t = useTranslations('pricing');
  const [attributionSearch, setAttributionSearch] = useState(attributionFromServer);
  useEffect(() => {
    if (attributionFromServer) return;
    setAttributionSearch(window.location.search);
  }, [attributionFromServer]);
  const oaGuideHref = '/guides/florida-llc-operating-agreement';
  const bookableCode = isActiveFormationState(state.code) ? state.code : 'FL';
  const formationState = getFormationState(bookableCode);
  const footnoteCopy = t('footnote', { state: formationState.name });
  // Headline price shown on each card is the LLC price for the active state
  // (LLC is the most common formation). When the corp price differs by more
  // than $1, surface the corporation split too.
  const tierPrice = (tierSlug: TierSlug) => {
    const llcParts = tierPriceParts(tierSlug, 'LLC', formationState.code);
    const corpParts = tierPriceParts(tierSlug, 'CORP', formationState.code);
    const llc = tierPackagePriceCents(tierSlug, 'LLC', formationState.code);
    const corp = tierPackagePriceCents(tierSlug, 'CORP', formationState.code);
    const corpDiffers = Math.abs(llc - corp) > 100;
    return { llc, corp, corpDiffers, llcParts, corpParts };
  };

  return (
    <section id="pricing" className={cn('py-20 md:py-28', className)}>
      <div className="container">
        {showHeader && (
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t('kicker')}
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
              {t('headline')}
            </h2>
            <p className="mt-4 text-lg text-ink-muted leading-relaxed">{t('subhead')}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {TIERS.map((tier) => {
            const tierName = t(`tier_${tier.slug}` as never);
            const tierDesc = t(`tier_${tier.slug}_desc` as never);
            const prices = tierPrice(tier.slug);
            return (
              <div
                key={tier.slug}
                className={cn(
                  'relative rounded-2xl bg-white border transition-all duration-300',
                  tier.recommended
                    ? 'border-primary shadow-glow lg:scale-[1.03] lg:-mt-2'
                    : 'border-border shadow-soft [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1'
                )}
              >
                {tier.ribbon && (
                  <div
                    className={cn(
                      'absolute -top-3 left-1/2 z-10 max-w-[calc(100%-1rem)] -translate-x-1/2 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider sm:px-4',
                      tier.recommended
                        ? 'bg-primary text-white'
                        : 'bg-gradient-gold text-white shadow-md'
                    )}
                  >
                    {tier.recommended ? (
                      <>
                        <Sparkles className="inline h-3 w-3 mb-0.5 mr-1" />{' '}
                        {t('ribbon_recommended')}
                      </>
                    ) : (
                      t('ribbon_premium')
                    )}
                  </div>
                )}

                <div className="p-5 sm:p-8">
                  <h3 className="font-display text-2xl font-medium">{tierName}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted leading-snug min-h-[40px]">{tierDesc}</p>
                  <PlanFeeDetails
                    tierSlug={tier.slug}
                    prices={prices}
                    stateName={formationState.name}
                    showCorpGuide={formationState.code === 'FL' && tier.slug === 'BASIC' && prices.corpDiffers}
                  />

                  <Button
                    asChild
                    size="lg"
                    variant={tier.recommended ? 'default' : 'outline'}
                    className="mt-4 w-full touch-manipulation active:scale-100"
                  >
                    <Link
                      href={hrefWithAttribution(
                        `/start?tier=${tier.slug}${bookableCode !== 'FL' ? `&state=${bookableCode}` : ''}`,
                        attributionSearch,
                      )}
                      onClick={() =>
                        trackCtaClicked('pricing_choose', {
                          tier: tier.slug,
                          state: bookableCode,
                        })
                      }
                    >
                      {t('chooseTier', { name: tierName })}
                    </Link>
                  </Button>
                </div>

                <div className="border-t border-border p-8 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    {t('whatsIncluded')}
                  </p>
                  <ul className="space-y-2.5">
                    {tier.features.map((feat) => {
                      const key = FEATURE_KEYS[feat.label];
                      const label = key ? t(key as never) : feat.label;
                      return (
                        <li
                          key={feat.label}
                          className={cn(
                            'flex items-start gap-2.5 text-sm leading-snug',
                            !feat.included && 'text-ink-subtle'
                          )}
                        >
                          {feat.included ? (
                            <Check
                              className={cn(
                                'h-4 w-4 shrink-0 mt-0.5',
                                feat.highlight ? 'text-accent' : 'text-primary'
                              )}
                              strokeWidth={3}
                            />
                          ) : (
                            <Minus className="h-4 w-4 shrink-0 mt-0.5 text-ink-subtle" />
                          )}
                          <span className={feat.highlight ? 'font-semibold text-ink' : ''}>
                            {tier.slug === 'STANDARD' &&
                            feat.label === 'Operating Agreement (custom)' &&
                            feat.included ? (
                              <Link href={oaGuideHref} className="underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
                                {label}
                              </Link>
                            ) : (
                              label
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-ink-subtle mt-10">{footnoteCopy}</p>
        {feeNote ? (
          <p className="text-center text-sm text-ink-muted mt-3 max-w-3xl mx-auto leading-relaxed">
            {feeNote}
          </p>
        ) : null}
        {feeNoteLink ? (
          <p className="text-center text-sm mt-3">
            <Link href={feeNoteLink.href} className="font-medium text-primary hover:underline">
              {feeNoteLink.label}
            </Link>
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" />
          <span>{t('serviceGuarantee')}</span>
        </div>
      </div>
    </section>
  );
}

function PlanFeeDetails({
  tierSlug,
  prices,
  stateName,
  showCorpGuide,
}: {
  tierSlug: TierSlug;
  prices: {
    llc: number;
    corp: number;
    corpDiffers: boolean;
    llcParts: { serviceCents: number; stateFeeCents: number };
    corpParts: { serviceCents: number; stateFeeCents: number };
  };
  stateName: string;
  showCorpGuide: boolean;
}) {
  const t = useTranslations('pricing');
  const [open, setOpen] = useState(false);
  const detailsId = `fee-details-${tierSlug}`;
  return (
    <>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="font-display text-5xl font-medium tracking-tight">
          {formatCurrency(prices.llc)}
        </span>
        <span className="text-sm text-ink-subtle">{t('allIn')}</span>
      </div>
      <p className="mt-1.5 text-xs text-ink-subtle">{t(`bestFor_${tierSlug}` as never)}</p>
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? t('feeDetailsHide') : t('feeDetails')}
      </button>
      <div id={detailsId} hidden={!open} className="mt-2 space-y-1">
        <p className="text-sm font-medium leading-snug text-ink">
          {feeSplitLabel(t, prices.llcParts, stateName, tierSlug)}
        </p>
        {prices.corpDiffers && (
          <p className="text-xs leading-snug text-ink-muted">
            {t(tierIncludesCertificateFees(tierSlug) ? 'feeSplitCorpWithCertificates' : 'feeSplitCorp', {
              service: formatCurrency(prices.corpParts.serviceCents),
              state: stateName,
              stateFee: formatCurrency(prices.corpParts.stateFeeCents),
              total: formatCurrency(prices.corp),
            })}
          </p>
        )}
        {showCorpGuide && (
          <p className="text-xs leading-snug">
            <Link href="/guides/how-to-form-a-florida-corporation" className="font-medium text-primary hover:underline">
              {t('corpGuide')}
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
