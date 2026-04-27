'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { FAQSection } from '@/components/marketing/FAQSection';
import { StateWaitlistForm } from '@/components/marketing/StateWaitlistForm';
import { Button } from '@/components/ui/button';
import { localizedStateName, type MarketingState } from '@/lib/marketing-states';

interface ComingSoonLandingProps {
  state: MarketingState;
  /** utm_campaign forwarded to the lead capture row, if present. */
  campaign?: string;
}

/**
 * Whole-page coming-soon experience for non-Florida visitors. Replaces the
 * Florida marketing layout when `state.availability !== 'active'`.
 *
 * Sections:
 *  - State-aware hero with waitlist CTA
 *  - "What you'll get when {State} launches" benefit grid
 *  - State-aware FAQ (handled by FAQSection via marketing-faq helper)
 *  - Florida path-out for visitors who can use Florida instead
 */
export function ComingSoonLanding({ state, campaign }: ComingSoonLandingProps) {
  const t = useTranslations('comingSoon');
  const locale = useLocale();
  const stateName = localizedStateName(state, locale);

  return (
    <>
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 mesh-bg" />
        <div className="aurora" />
        <div
          className="absolute inset-x-0 top-0 -z-10 h-[600px] dot-pattern opacity-30"
          style={{ maskImage: 'linear-gradient(180deg, white 0%, transparent 70%)' }}
        />

        <div className="container relative grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent-700">
              <Sparkles className="h-3.5 w-3.5" />
              {t('badgeOtherState', { state: stateName })}
            </span>

            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-medium leading-[1.1] tracking-tight text-balance">
              {t('heroHeadlineLine1', { state: stateName })}{' '}
              <span className="gradient-text italic">{t('heroHeadlineLine2')}</span>
            </h1>

            <p className="mt-5 text-base md:text-lg text-ink-muted leading-relaxed max-w-xl">
              {t('heroSubhead', { state: stateName })}
            </p>

            <ul className="mt-6 space-y-2 text-sm text-ink-muted">
              <li className="inline-flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>{t('trustEarlyAccess')}</span>
              </li>
              <li className="inline-flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>{t('trustEmailOnly', { state: stateName })}</span>
              </li>
              <li className="inline-flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>{t('trustNoSpam')}</span>
              </li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <StateWaitlistForm state={state} source="homepage" campaign={campaign} />
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t('whyEyebrow', { state: stateName })}
            </span>
            <h2 className="mt-3 font-display text-3xl md:text-4xl font-medium tracking-tight">
              {t('whyHeadline', { state: stateName })}
            </h2>
            <p className="mt-4 text-base md:text-lg text-ink-muted leading-relaxed">
              {t('whySubhead', { state: stateName })}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <BenefitCard
              icon={<Clock className="h-5 w-5" />}
              title={t('whyItem1Title')}
              body={t('whyItem1Body', { state: stateName })}
            />
            <BenefitCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title={t('whyItem2Title')}
              body={t('whyItem2Body', { state: stateName })}
            />
            <BenefitCard
              icon={<Wallet className="h-5 w-5" />}
              title={t('whyItem3Title')}
              body={t('whyItem3Body', { state: stateName })}
            />
          </div>
        </div>
      </section>

      <FAQSection state={state} />

      <section className="py-16 md:py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto rounded-3xl bg-gradient-to-br from-primary via-primary-hover to-primary-700 p-10 md:p-14 text-white text-center md:text-left md:flex md:items-center md:justify-between gap-8">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-tight">
                {t('floridaPathHeadline')}
              </h2>
              <p className="mt-3 text-base md:text-lg text-white/85 leading-relaxed max-w-2xl">
                {t('floridaPathBody')}
              </p>
            </div>
            <div className="mt-6 md:mt-0 shrink-0">
              <Button asChild size="xl" variant="accent" className="text-base shadow-xl">
                <Link href="/?state=FL">
                  {t('floridaPathCta')}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function BenefitCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-soft hover:shadow-card transition-shadow">
      <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <h3 className="font-display text-lg font-medium leading-tight">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}
