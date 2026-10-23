'use client';

import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import {
  Zap,
  Shield,
  CalendarCheck,
  FileText,
  Search,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';

interface FeatureGridProps {
  /** Resolved marketing state. Defaults to Florida for backwards compatibility. */
  state?: MarketingState;
}

/**
 * Pick a per-state copy variant for the feature grid. The audit (May 2026)
 * flagged that this section silently reused Florida-only copy
 * ("Florida Department of State", "Sunbiz database", "$400 late fee")
 * even on the WY and DE landing pages. We now branch on state code so
 * Wyoming and Delaware visitors see facts that match their state.
 */
export function FeatureGrid({ state = FLORIDA }: FeatureGridProps = {}) {
  const t = useTranslations('features');
  const tTiming = useTranslations('stateTiming');
  const locale = useLocale();
  const stateLabel = locale === 'es' ? state.nameEs : state.name;
  const agency =
    state.code === 'FL'
      ? t('agencyFl')
      : state.code === 'WY'
        ? t('agencyWy')
        : state.code === 'DE'
          ? t('agencyDe')
          : t('agencyOther', { state: stateLabel });
  const timing = tTiming(state.code);

  // Same-day submission still applies in every state. Approval cadence
  // differs and is surfaced via state-specific marketing timing.
  const filed1DayBody = t('filedSameDayBody', { agency, timing });

  // Name pre-check varies by state. Only FL has the live Sunbiz API.
  const liveCheckBody =
    state.code === 'FL'
      ? t('liveCheckFl')
      : state.code === 'WY'
        ? t('liveCheckWy')
        : state.code === 'DE'
          ? t('liveCheckDe')
          : t('liveCheckOther', { state: stateLabel });
  const freeRABody = t('freeRAState', { state: stateLabel });

  const complianceBody =
    state.code === 'FL'
      ? t('complianceBody')
      : state.code === 'WY'
        ? t('complianceWy')
        : state.code === 'DE'
          ? t('complianceDe')
          : t('complianceOther', { state: stateLabel });

  const transparentBody =
    state.code === 'FL' ? t('transparentBody') : t('transparentState', { state: stateLabel });

  // The headline title for "filed in 1 day" only matches Florida's actual
  // turnaround. WY and DE state queues are weeks long.
  const filed1DayTitle = state.code === 'FL' ? t('filed1Day') : t('filedSameDayTitle');
  const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Zap, title: filed1DayTitle, body: filed1DayBody },
    { icon: Search, title: t('liveCheck'), body: liveCheckBody },
    { icon: Shield, title: t('freeRA'), body: freeRABody },
    { icon: FileText, title: t('documents'), body: t('documentsBody') },
    { icon: CalendarCheck, title: t('compliance'), body: complianceBody },
    { icon: Banknote, title: t('transparent'), body: transparentBody },
  ];

  const subhead = state.code === 'FL' ? t('subhead') : t('subheadState', { state: stateLabel });

  return (
    <section
      data-marketing-state={state.code}
      className="py-20 md:py-28 bg-white border-y border-border"
    >
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t('kicker')}
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
            {t('headline1')} <span className="italic text-primary">{t('headline2')}</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{subhead}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="group rounded-2xl border border-border bg-white p-7 hover:border-primary/30 hover:shadow-card transition-all"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <h3 className="mt-5 text-lg font-semibold font-display">{feature.title}</h3>
              <p className="mt-2 text-sm text-ink-muted leading-relaxed">{feature.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
