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

export function FeatureGrid() {
  const t = useTranslations('features');

  const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Zap, title: t('filed1Day'), body: t('filed1DayBody') },
    { icon: Search, title: t('liveCheck'), body: t('liveCheckBody') },
    { icon: Shield, title: t('freeRA'), body: t('freeRABody') },
    { icon: FileText, title: t('documents'), body: t('documentsBody') },
    { icon: CalendarCheck, title: t('compliance'), body: t('complianceBody') },
    { icon: Banknote, title: t('transparent'), body: t('transparentBody') },
  ];

  return (
    <section className="py-20 md:py-28 bg-white border-y border-border">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t('kicker')}
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
            {t('headline1')} <span className="italic text-primary">{t('headline2')}</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t('subhead')}</p>
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
