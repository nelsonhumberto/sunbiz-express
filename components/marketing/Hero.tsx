'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ArrowRight, Sparkles, Clock, Shield, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Hero() {
  const t = useTranslations('hero');

  return (
    <section className="relative pt-12 pb-24 md:pt-20 md:pb-32 overflow-hidden">
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
            href="/about"
            className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded-full bg-primary/5 border border-primary/10 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('badge')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.05] tracking-tight text-balance">
            {t('headlineLine1')} <br className="hidden md:block" />
            <span className="gradient-text italic">{t('headlineLine2')}</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-ink-muted leading-relaxed max-w-2xl mx-auto text-balance">
            {t('subhead')}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Button asChild size="lg" className="group">
              <Link href="/sign-up">
                {t('startFiling')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">{t('seePricing')}</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              {t('noCreditCard')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {t('filedIn1Day')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-accent fill-accent" />
              {t('rating')}
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-20 max-w-5xl mx-auto"
        >
          <HeroPreview />
        </motion.div>
      </div>
    </section>
  );
}

function HeroPreview() {
  const t = useTranslations('hero');
  return (
    <div className="relative">
      <div className="absolute -top-8 -left-8 -bottom-8 -right-8 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 rounded-3xl blur-2xl opacity-60" />
      <div className="relative ring-card rounded-2xl bg-white overflow-hidden border border-border">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-300" />
          <span className="h-3 w-3 rounded-full bg-yellow-300" />
          <span className="h-3 w-3 rounded-full bg-green-300" />
          <div className="ml-3 px-3 py-1 rounded-md bg-white border border-border text-xs text-ink-muted">
            sunbizexpress.example/wizard/your-llc/2
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          <div className="md:col-span-2 p-8 md:p-10 border-r border-border">
            <Badge variant="secondary" className="mb-4">
              {t('previewStep')}
            </Badge>
            <h3 className="font-display text-2xl font-medium mb-2">{t('previewQuestion')}</h3>
            <p className="text-sm text-ink-muted mb-6">{t('previewSubtitle')}</p>

            <div className="relative">
              <input
                value="Sunshine Coast Ventures LLC"
                readOnly
                className="w-full h-12 px-4 pr-32 rounded-md border border-input bg-card text-base font-medium"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-subtle text-success text-xs font-semibold">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('previewAvailable')}
              </div>
            </div>

            <div className="mt-4 p-3 rounded-md bg-success-subtle/50 border border-success/20 text-sm text-ink">
              {t('previewSuccess')}
            </div>
          </div>

          <div className="p-8 md:p-10 bg-muted/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t('previewSummary')}
            </p>
            <div className="mt-4 space-y-3">
              <SummaryRow label={t('previewStateFee')} amount="$125.00" />
              <SummaryRow label={t('previewProFormation')} amount="$99.00" />
              <SummaryRow label={t('previewRA')} amount={t('previewIncluded')} muted />
              <SummaryRow label={t('previewOA')} amount={t('previewIncluded')} muted />
              <SummaryRow label={t('previewEIN')} amount={t('previewIncluded')} muted />
            </div>
            <div className="border-t border-border mt-4 pt-4 flex items-baseline justify-between">
              <span className="text-sm font-medium">{t('previewTotalToday')}</span>
              <span className="font-display text-2xl font-medium">
                $224<span className="text-sm">.00</span>
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

function SummaryRow({ label, amount, muted }: { label: string; amount: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? 'text-ink-subtle' : 'text-ink-muted'}>{label}</span>
      <span className={muted ? 'text-ink-subtle font-medium' : 'text-ink font-medium'}>{amount}</span>
    </div>
  );
}
