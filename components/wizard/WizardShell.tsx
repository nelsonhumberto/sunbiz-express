'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, X, Save, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/marketing/Logo';
import { LanguageSwitcher } from '@/components/marketing/LanguageSwitcher';
import { Progress } from '@/components/ui/progress';
import { TOTAL_STEPS } from '@/lib/wizard-constants';
import { CostSidebar } from './CostSidebar';
import { cn } from '@/lib/utils';

interface WizardShellProps {
  filingId: string;
  step: number;
  children: React.ReactNode;
  costData: {
    entityType: 'LLC' | 'CORP';
    tier: string;
    addOnSlugs: string[];
  };
  saved?: boolean;
}

export function WizardShell({ filingId, step, children, costData, saved }: WizardShellProps) {
  const t = useTranslations('wizard');
  const tCommon = useTranslations('common');

  const stepKey = `step${step}Title` as keyof IntlMessages;
  const subKey = `step${step}Subtitle` as keyof IntlMessages;
  const title = t(stepKey as never);
  const subtitle = t(subKey as never);

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-border">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <SaveIndicator saved={saved} />
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="text-sm text-ink-muted hover:text-ink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">{t('saveAndExit')}</span>
            </Link>
          </div>
        </div>
        <div className="container pb-4">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="text-ink-muted font-medium">
              {t('stepOf', { current: step, total: TOTAL_STEPS })} ·{' '}
              <span className="text-primary font-semibold">{title}</span>
            </span>
            <span className="text-ink-subtle">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </header>

      <div className="flex-1 container py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-2 min-w-0">
            <div className="mb-8">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-balance">
                  {title}
                </h1>
                <p className="mt-2 text-ink-muted text-base md:text-lg leading-relaxed">
                  {subtitle}
                </p>
              </motion.div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          <aside className="lg:sticky lg:top-32 lg:self-start">
            <CostSidebar
              entityType={costData.entityType}
              tier={costData.tier as any}
              addOnSlugs={costData.addOnSlugs as any}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ saved }: { saved?: boolean }) {
  const tCommon = useTranslations('common');
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (saved) {
      setShow(true);
      const t = setTimeout(() => setShow(false), 2500);
      return () => clearTimeout(t);
    }
  }, [saved]);

  return (
    <span
      className={cn(
        'hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-opacity',
        show ? 'opacity-100 bg-success-subtle text-success' : 'opacity-50 bg-muted text-ink-muted'
      )}
    >
      {show ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
      {show ? tCommon('saved') : tCommon('autoSaving')}
    </span>
  );
}

export function WizardActions({
  prevHref,
  nextLabel,
  nextDisabled,
  pending,
  onNext,
  isSubmit,
  hideBack,
}: {
  prevHref?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  pending?: boolean;
  onNext?: () => void;
  isSubmit?: boolean;
  hideBack?: boolean;
}) {
  const tCommon = useTranslations('common');
  const label = nextLabel ?? tCommon('continue');
  return (
    <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
      {prevHref && !hideBack ? (
        <Link
          href={prevHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {tCommon('back')}
        </Link>
      ) : (
        <span />
      )}
      <button
        type={isSubmit ? 'submit' : 'button'}
        onClick={onNext}
        disabled={nextDisabled || pending}
        className={cn(
          'inline-flex items-center gap-2 h-12 px-8 rounded-lg text-base font-semibold transition-all',
          'bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-md active:scale-[0.98]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
        )}
      >
        {pending ? tCommon('saving') : label}
        {!pending && <span className="text-lg leading-none">→</span>}
      </button>
    </div>
  );
}

// Loose typing for the message namespace lookup above
type IntlMessages = Record<string, unknown>;
