'use client';

import { motion } from 'framer-motion';
import {
  Zap,
  Shield,
  CalendarCheck,
  FileText,
  Search,
  Banknote,
  type LucideIcon,
} from 'lucide-react';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Zap,
    title: 'Filed in 1 business day',
    body: 'We submit to the Florida Department of State the same day you complete checkout, not 7–10 days later.',
  },
  {
    icon: Search,
    title: 'Live name availability',
    body: "Real-time check against the Sunbiz database. We tell you if it's distinguishable on the record before you commit.",
  },
  {
    icon: Shield,
    title: 'Year-1 Registered Agent · free',
    body: "We maintain a Florida physical address for service of process — keeping your home address private.",
  },
  {
    icon: FileText,
    title: 'Documents that work',
    body: 'Articles of Organization, Operating Agreement, EIN letter — formatted for banks, lenders, and the IRS.',
  },
  {
    icon: CalendarCheck,
    title: 'Compliance, automated',
    body: "Annual report reminders before the May 1 deadline. Optional managed filing means you'll never pay the $400 late fee.",
  },
  {
    icon: Banknote,
    title: 'Transparent pricing',
    body: 'State fees shown separately. No hidden subscriptions. No upsell carousel. The price you see is the price you pay.',
  },
];

export function FeatureGrid() {
  return (
    <section className="py-20 md:py-28 bg-white border-y border-border">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Why Sunbiz Express
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
            The boring stuff,{' '}
            <span className="italic text-primary">handled brilliantly.</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            Everything you need to form, fund, and run a Florida business — without the legal-tech overwhelm.
          </p>
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
