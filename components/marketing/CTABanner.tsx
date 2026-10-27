'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FLORIDA, localizedStateName, type MarketingState } from '@/lib/marketing-states';
import { isActiveFormationState } from '@/lib/formation-states';
import { trackCtaClicked } from '@/lib/analytics';
import { localizedHref } from '@/lib/locale-paths';

interface CTABannerProps {
  /** Resolved marketing state. Defaults to Florida (active). */
  state?: MarketingState;
}

export function CTABanner({ state = FLORIDA }: CTABannerProps = {}) {
  const t = useTranslations('ctaBanner');
  const locale = useLocale();
  const bookable = isActiveFormationState(state.code);
  const stateLabel = localizedStateName(bookable ? state : FLORIDA, locale);
  const signUpHref = localizedHref(
    bookable && state.code !== 'FL' ? `/start?state=${state.code}` : '/start',
    locale,
  );
  const headlineState =
    bookable && state.code !== 'FL' ? t('headlineState', { state: stateLabel }) : t('headline2');
  const subhead =
    bookable && state.code !== 'FL' ? t('subheadState', { state: stateLabel }) : t('subhead');
  return (
    <section data-marketing-state={bookable ? state.code : 'FL'} className="overflow-hidden py-16 md:py-24">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary-hover to-primary-700 p-12 md:p-16 text-white max-w-6xl mx-auto"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
            <div className="absolute inset-0 mesh-bg opacity-30" />
            <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary-300/30 blur-3xl" />
          </div>

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
                  onClick={() => trackCtaClicked('cta_banner', { state: bookable ? state.code : 'FL' })}
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
