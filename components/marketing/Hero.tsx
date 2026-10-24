'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Sparkles, Clock, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';
import { getFormationState, type StateCode } from '@/lib/formation-states';
import { tierPackagePriceCents } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { trackCtaClicked, trackEvent } from '@/lib/analytics';
import { localizedHref } from '@/lib/locale-paths';
import { nameCheckSubmittedEvent, startHrefForNameCheck } from '@/lib/name-check';
import { TOTAL_STEPS } from '@/lib/wizard-constants';

interface HeroProps {
  /**
   * Resolved marketing state. Defaults to Florida. Active states (FL/WY/DE)
   * render the full hero with a state badge; coming-soon states are routed
   * to `ComingSoonLanding` upstream.
   */
  state?: MarketingState;
}

export function Hero({ state = FLORIDA }: HeroProps = {}) {
  const t = useTranslations('hero');
  const tTiming = useTranslations('stateTiming');
  const locale = useLocale();
  const stateLabel = locale === 'es' ? state.nameEs : state.name;
  const alsoStates =
    state.code === 'WY' ? t('alsoWy') : state.code === 'DE' ? t('alsoDe') : t('alsoFl');
  // Funnel everyone through /start so the chosen formation state and the
  // guest-friendly entry experience travel with the visitor. /start writes
  // the selected state into a cookie and creates a draft for guests, then
  // jumps into the wizard.
  const startFilingHref = localizedHref(`/start?state=${state.code}`, locale);

  return (
    <section
      data-marketing-state={state.code}
      className="relative pt-12 pb-24 md:pt-20 md:pb-32 overflow-hidden"
    >
      <div className="absolute inset-0 mesh-bg" />
      <div className="aurora" />
      <div
        className="absolute inset-x-0 top-0 -z-10 h-[600px] dot-pattern opacity-30"
        style={{ maskImage: 'linear-gradient(180deg, white 0%, transparent 70%)' }}
      />

      <div className="container relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <Link
            href={localizedHref('/about', locale)}
            className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-primary/5 border border-primary/10 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {state.code === 'FL' ? t('badge') : t('badgeState', { state: stateLabel })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.05] tracking-tight text-balance">
            {state.code === 'FL' ? t('headlineLine1') : t('headlineState', { state: stateLabel })}{' '}
            <br className="hidden md:block" />
            <span className="gradient-text italic">{t('headlineLine2')}</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-ink-muted leading-relaxed max-w-2xl mx-auto text-balance">
            {state.code === 'FL' ? t('subhead') : t('subheadState', { state: stateLabel })}
          </p>

          <p className="mt-4 text-sm text-ink-muted leading-relaxed max-w-2xl mx-auto text-balance">
            {t('formaLine')}
          </p>

          <HeroNameCheck stateCode={state.code} />

          <div className="mt-3 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button asChild size="lg" className="group">
              <Link
                href={startFilingHref}
                onClick={() => trackCtaClicked('hero_start', { state: state.code })}
              >
                {t('startFiling')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={localizedHref('/pricing', locale)}>{t('seePricing')}</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              {t('noCreditCard')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {state.code === 'FL' ? t('filedIn1Day') : tTiming(state.code)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-accent" />
              {t('rating')}
            </span>
          </div>

          {/* Multi-state callout - replaces the old geo-redirect.
              Lets non-FL visitors immediately discover WY/DE without
              hunting through the state switcher. */}
          <p className="mt-5 text-xs text-ink-subtle">
            {t('filingIn')}{' '}
            <span className="font-medium text-ink">{stateLabel}</span> ·{' '}
            <Link
              href={localizedHref('/states', locale)}
              className="text-primary hover:underline font-medium"
            >
              {t('alsoServe', { states: alsoStates })} →
            </Link>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-20 max-w-5xl mx-auto"
        >
          <HeroPreview state={state} />
        </motion.div>
      </div>
    </section>
  );
}

function HeroNameCheck({ stateCode }: { stateCode: string }) {
  const t = useTranslations('hero');
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [missing, setMissing] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const href = startHrefForNameCheck(stateCode, value);
    if (!href) {
      setMissing(true);
      return;
    }
    const submitted = nameCheckSubmittedEvent('hero');
    trackEvent(submitted.event, submitted.properties);
    router.push(localizedHref(href, locale));
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 mx-auto w-full max-w-xl text-left">
      <label htmlFor="hero-business-name" className="sr-only">
        {t('nameCheckLabel')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="hero-business-name"
          type="text"
          inputMode="text"
          name="businessName"
          value={value}
          maxLength={100}
          autoComplete="organization"
          enterKeyHint="search"
          placeholder={t('nameCheckPlaceholder')}
          aria-invalid={missing || undefined}
          aria-describedby={missing ? 'hero-business-name-error' : undefined}
          onChange={(e) => {
            setValue(e.target.value.slice(0, 100));
            if (missing) setMissing(false);
          }}
          className="h-12 w-full min-w-0 flex-1 rounded-md border border-input bg-card px-4 text-base text-ink"
        />
        <Button type="submit" size="lg" className="w-full shrink-0 sm:w-auto">
          {t('checkName')}
        </Button>
      </div>
      {missing ? (
        <p id="hero-business-name-error" className="mt-2 text-xs text-destructive">
          {t('nameCheckRequired')}
        </p>
      ) : null}
    </form>
  );
}

function HeroPreview({ state = FLORIDA }: { state?: MarketingState }) {
  const t = useTranslations('hero');
  const formationState = getFormationState(state.code);
  const stateCode = (state.code as StateCode) || 'FL';
  const previewPrice = tierPackagePriceCents('STANDARD', 'LLC', stateCode);
  const previewPriceFormatted = formatCurrency(previewPrice);
  const searchUrl =
    state.code === 'FL'
      ? 'launchforma.com/wizard/your-llc/2'
      : `launchforma.com/wizard/your-${formationState.slug}-llc/2`;

  return (
    <div className="relative">
      <div className="absolute -top-8 -left-8 -bottom-8 -right-8 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 rounded-3xl blur-2xl opacity-60" />
      <div className="relative ring-card rounded-2xl bg-white overflow-hidden border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-300" />
          <span className="h-3 w-3 rounded-full bg-yellow-300" />
          <span className="h-3 w-3 rounded-full bg-green-300" />
          <div className="ml-3 px-3 py-1 rounded-md bg-white border border-border text-xs text-ink-muted">
            {searchUrl}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          <div className="md:col-span-2 p-8 md:p-10 border-r border-border">
            <Badge variant="secondary" className="mb-4">
              {t('previewStep', { current: 2, total: TOTAL_STEPS })}
            </Badge>
            <h3 className="font-display text-2xl font-medium mb-2">{t('previewQuestion')}</h3>
            <p className="text-sm text-ink-muted leading-relaxed">{t('previewSubtitle')}</p>
            <p className="mt-4 text-sm text-ink-muted leading-relaxed">{t('previewHint')}</p>
          </div>

          <div className="p-8 md:p-10 bg-muted/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t('previewSummary')}
            </p>
            <div className="mt-4 space-y-3">
              <SummaryRow
                label={t('previewBankReady')}
                sublabel={t('previewAllIn', { name: formationState.name })}
                amount={previewPriceFormatted}
              />
              <SummaryRow label={t('previewRA')} amount={t('previewIncluded')} muted />
              <SummaryRow label={t('previewOA')} amount={t('previewIncluded')} muted />
            </div>
            <div className="border-t border-border mt-4 pt-4 flex items-baseline justify-between">
              <span className="text-sm font-medium">{t('previewTotalToday')}</span>
              <span className="font-display text-2xl font-medium">
                {previewPriceFormatted}
              </span>
            </div>
            <div className="mt-3 text-xs text-ink-subtle leading-relaxed">
              {t('previewNoSubscription')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  sublabel,
  amount,
  muted,
}: {
  label: string;
  sublabel?: string;
  amount: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between text-sm gap-2">
      <div className="min-w-0">
        <span className={muted ? 'text-ink-subtle' : 'text-ink-muted'}>{label}</span>
        {sublabel && (
          <span className="block text-[11px] text-ink-subtle leading-snug">{sublabel}</span>
        )}
      </div>
      <span className={muted ? 'text-ink-subtle font-medium shrink-0' : 'text-ink font-medium shrink-0'}>
        {amount}
      </span>
    </div>
  );
}
