'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';

export function HowItWorks() {
  const t = useTranslations('howItWorks');

  const STEPS = [
    { n: '01', title: t('step1Title'), body: t('step1Body') },
    { n: '02', title: t('step2Title'), body: t('step2Body') },
    { n: '03', title: t('step3Title'), body: t('step3Body') },
    { n: '04', title: t('step4Title'), body: t('step4Body') },
  ];

  return (
    <section className="py-20 md:py-28">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t('kicker')}
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
            {t('headline1')} <span className="italic text-primary">{t('headline2')}</span>{' '}
            {t('headline3')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative"
            >
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-border to-transparent -translate-x-1/2 z-0" />
              )}
              <div className="relative bg-white border border-border rounded-2xl p-6 hover:shadow-card transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <span className="font-display text-3xl font-medium text-primary/30">{step.n}</span>
                  <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={2.5} />
                </div>
                <h3 className="font-semibold text-lg leading-tight">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-muted leading-relaxed">{step.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
