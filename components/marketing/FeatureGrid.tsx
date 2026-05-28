'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
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
import { getFormationState } from '@/lib/formation-states';

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
function featureCopyFor(state: MarketingState) {
  const rule = getFormationState(state.code);
  const stateName = state.name;
  const agency =
    state.code === 'FL'
      ? 'Florida Department of State'
      : state.code === 'WY'
        ? 'Wyoming Secretary of State'
        : state.code === 'DE'
          ? 'Delaware Division of Corporations'
          : `${stateName} Secretary of State`;

  // Same-day submission still applies in every state. Approval cadence
  // differs and is surfaced via state-specific marketing timing.
  const filed1DayBody = `We submit to the ${agency} the same day you complete checkout. ${rule.marketingTiming.badgeFallback}.`;

  // Name pre-check varies by state — only FL has the live Sunbiz API.
  const liveCheckBody =
    state.code === 'FL'
      ? "Real-time check against the Sunbiz database. We tell you if it's distinguishable on the record before you commit."
      : state.code === 'WY'
        ? 'We scan the Wyoming Secretary of State business registry and flag conflicts, restricted words (bank, trust, university), and entries that require manual review before you commit.'
        : state.code === 'DE'
          ? 'We surface Delaware Division of Corporations naming conventions, restricted-word reviews, and known subjective-rejection patterns so you do not get bounced at filing.'
          : `We check the ${stateName} business registry before you commit so you do not get bounced at filing.`;

  const freeRABody = `We maintain a ${stateName} physical address for service of process — keeping your home address private and your entity in good standing.`;

  // Annual-report copy needs to reference the right deadline & penalty
  // (or absence of one). The audit explicitly flagged that WY/DE pages
  // were claiming Florida's $400 late fee.
  const complianceBody =
    state.code === 'FL'
      ? "Annual report reminders before the May 1 deadline. Optional managed filing means you'll never pay the $400 late fee."
      : state.code === 'WY'
        ? "Wyoming annual reports are due on the first of your anniversary month each year ($60 minimum License Tax). We remind you well in advance — and we can file for you."
        : state.code === 'DE'
          ? "Delaware LLCs pay a $300 Annual Tax by June 1; Corporations file Annual Report + Franchise Tax by March 1. Miss them and the state charges $200 + 1.5%/month. We remind you — and can file for you."
          : `Annual compliance reminders well before the ${stateName} deadline — and optional managed filing so you never pay a late penalty.`;

  const transparentBody = `One clear price per package — ${stateName} filing fee already included. No hidden subscriptions. No surprise checkout fees.`;

  return {
    filed1DayBody,
    liveCheckBody,
    freeRABody,
    complianceBody,
    transparentBody,
  };
}

export function FeatureGrid({ state = FLORIDA }: FeatureGridProps = {}) {
  const t = useTranslations('features');
  const copy = featureCopyFor(state);

  // The headline title for "filed in 1 day" only matches Florida's actual
  // turnaround. WY and DE state queues are weeks long — surface that
  // honestly instead of overclaiming.
  const filed1DayTitle =
    state.code === 'FL'
      ? t('filed1Day')
      : 'Submitted the same business day';

  const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Zap, title: filed1DayTitle, body: copy.filed1DayBody },
    { icon: Search, title: t('liveCheck'), body: copy.liveCheckBody },
    { icon: Shield, title: t('freeRA'), body: copy.freeRABody },
    { icon: FileText, title: t('documents'), body: t('documentsBody') },
    { icon: CalendarCheck, title: t('compliance'), body: copy.complianceBody },
    { icon: Banknote, title: t('transparent'), body: copy.transparentBody },
  ];

  const subhead =
    state.code === 'FL'
      ? t('subhead')
      : `Everything you need to form, fund, and run a ${state.name} business — without the legal-tech overwhelm.`;

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
