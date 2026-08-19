'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Check, Minus, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIERS, tierPackagePriceCents, type TierSlug } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';
import { getFormationState } from '@/lib/formation-states';
import { trackCtaClicked } from '@/lib/analytics';

interface PricingTableProps {
  showHeader?: boolean;
  className?: string;
  /** Resolved marketing state (controls the per-state footnote). */
  state?: MarketingState;
}

const FEATURE_KEYS: Record<string, string> = {
  'Florida filing fee included': 'feat_floridaFee',
  'State filing fee included': 'feat_floridaFee',
  'Articles of Organization / Incorporation prepared & submitted': 'feat_articles',
  'Same-business-day filing': 'feat_sameDay',
  'Same-business-day preparation and submission': 'feat_sameDayPrep',
  'Free Year-1 Registered Agent': 'feat_freeRA',
  'Email support': 'feat_emailSupport',
  'EIN Acquisition (IRS Form SS-4)': 'feat_ein',
  'Operating Agreement (custom)': 'feat_oa',
  'Operating Agreement (add-on)': 'feat_oaAddOn',
  'Certified Copy of Articles': 'feat_certCopy',
  'Certificate of Status (state-issued)': 'feat_certStatus',
  'Priority email support': 'feat_chatSupport',
  'Free .com domain': 'feat_domain',
  'Free .com domain (year 1)': 'feat_domainConcierge',
  'Annual Compliance Service': 'feat_compliance',
  'Compliance Alerts Plus (year 1)': 'feat_complianceAlerts',
  'Priority phone & email support': 'feat_phoneSupport',
  'S-Corp Election guidance': 'feat_scorp',
  'Banking resolution template': 'feat_banking',
  'Business email setup': 'feat_email',
  'Quarterly compliance check-ins': 'feat_quarterly',
  'Everything in Filing Only': 'feat_everythingBasic',
  'Everything in Basic Filing': 'feat_everythingBasic',
  'Everything in Bank-Ready Filing': 'feat_everythingBankReady',
  'BOI filing (FinCEN)': 'feat_boi',
  'BOI filing (FinCEN, included)': 'feat_boi',
  'S-Corp Election filing (Form 2553)': 'feat_scorpFiling',
};

export function PricingTable({
  showHeader = true,
  className,
  state = FLORIDA,
}: PricingTableProps) {
  const t = useTranslations('pricing');
  const formationState = getFormationState(state.code);
  const llcStateFee = formatCurrency(formationState.fees.llcTotal);
  const corpStateFee = formatCurrency(formationState.fees.corpTotal);
  const footnoteCopy =
    state.code === 'FL'
      ? t('footnote')
      : `Each package includes the required ${formationState.name} state filing fee (${llcStateFee} LLC / ${corpStateFee} Corporation). LaunchForma remits the state fee on your behalf.`;
  const filingFeeCopy =
    state.code === 'FL'
      ? t('filingFeeIncluded')
      : `${formationState.name} filing fee included`;
  // Headline price shown on each card is the LLC price for the active state
  // (LLC is the most common formation). When the corp price differs by more
  // than $1, surface it as a small subtitle so customers see both.
  const tierPrice = (tierSlug: TierSlug) => {
    const llc = tierPackagePriceCents(tierSlug, 'LLC', formationState.code);
    const corp = tierPackagePriceCents(tierSlug, 'CORP', formationState.code);
    const corpDiffers = Math.abs(llc - corp) > 100;
    return { llc, corp, corpDiffers };
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
          {TIERS.map((tier, i) => {
            const tierName = t(`tier_${tier.slug}` as never);
            const tierDesc = t(`tier_${tier.slug}_desc` as never);
            const prices = tierPrice(tier.slug);
            return (
              <motion.div
                key={tier.slug}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={cn(
                  'relative rounded-2xl bg-white border transition-all duration-300',
                  tier.recommended
                    ? 'border-primary shadow-glow lg:scale-[1.03] lg:-mt-2'
                    : 'border-border shadow-soft hover:shadow-card hover:-translate-y-1'
                )}
              >
                {tier.ribbon && (
                  <div
                    className={cn(
                      'absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
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

                <div className="p-8">
                  <h3 className="font-display text-2xl font-medium">{tierName}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted leading-snug min-h-[40px]">{tierDesc}</p>
                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className="font-display text-5xl font-medium">
                      {formatCurrency(prices.llc)}
                    </span>
                    <span className="text-ink-subtle text-sm">{t('allIn')}</span>
                  </div>
                  {prices.corpDiffers && (
                    <p className="mt-1 text-xs text-ink-subtle">
                      {`Corporation: ${formatCurrency(prices.corp)}`}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    {t(`bestFor_${tier.slug}` as never)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">
                    ✓ {filingFeeCopy}
                  </p>

                  <Button
                    asChild
                    size="lg"
                    variant={tier.recommended ? 'default' : 'outline'}
                    className="mt-6 w-full"
                  >
                    <Link
                      href={`/start?tier=${tier.slug}${state.code !== 'FL' ? `&state=${state.code}` : ''}`}
                      onClick={() =>
                        trackCtaClicked('pricing_choose', {
                          tier: tier.slug,
                          state: state.code,
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
                            {label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-xs text-ink-subtle mt-10">{footnoteCopy}</p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-success shrink-0" />
          <span>
            14-day money-back guarantee on LaunchForma&apos;s service fee - no questions asked.
          </span>
        </div>
      </div>
    </section>
  );
}
