'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';
import { trackCtaClicked } from '@/lib/analytics';

interface CTABannerProps {
  /** Resolved marketing state. Defaults to Florida (active). */
  state?: MarketingState;
}

export function CTABanner({ state = FLORIDA }: CTABannerProps = {}) {
  const t = useTranslations('ctaBanner');
  // Route to the low-friction guest flow (/start) rather than full account
  // creation (/sign-up). Cold ad traffic gets straight into the wizard; an
  // account is auto-created after payment.
  const signUpHref = state.code === 'FL' ? '/start' : `/start?state=${state.code}`;
  const headlineState = state.code === 'FL' ? t('headline2') : `${state.name} business?`;
  // The default i18n subhead promises "we submit to the state the same
  // business day" - true everywhere we file. We keep the same phrasing
  // but soften the implied turnaround for slow-queue states (WY/DE) so
  // the audit-flagged Florida-only language doesn't bleed through.
  const subhead =
    state.code === 'FL'
      ? t('subhead')
      : `Most owners finish in 15 minutes. We submit to ${state.name} the same business day - state processing varies.`;

  return (
    <section data-marketing-state={state.code} className="py-16 md:py-24">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-hover to-primary-700 p-12 md:p-16 text-white max-w-6xl mx-auto"
        >
          <div className="absolute inset-0 mesh-bg opacity-30" />
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary-300/30 blur-3xl" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 items-center gap-8">
            <div>
              <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight leading-tight">
                {t('headline1')} <span className="italic">{headlineState}</span>
              </h2>
              <p className="mt-4 text-lg text-white/85 leading-relaxed max-w-md">{subhead}</p>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-3">
              <Button asChild size="xl" variant="accent" className="text-base shadow-xl">
                <Link
                  href={signUpHref}
                  onClick={() => trackCtaClicked('cta_banner', { state: state.code })}
                >
                  {t('cta')}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <p className="text-xs text-white/70">{t('footnote')}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
