'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

const STEPS = [
  {
    n: '01',
    title: 'Tell us about your business',
    body: 'Choose LLC or Corporation, enter your name, and we check Sunbiz availability live.',
  },
  {
    n: '02',
    title: 'Pick your service tier',
    body: 'Starter (free), Pro ($99), or Concierge ($299). Add EIN, Operating Agreement, or domain.',
  },
  {
    n: '03',
    title: 'Sign and pay once',
    body: 'Type-to-sign your filing. Pay state fees + service fee in one transparent transaction.',
  },
  {
    n: '04',
    title: 'We file with Florida',
    body: 'Submitted same business day. Documents are emailed and stored in your dashboard.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 md:py-28">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            How it works
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
            From browser tab to{' '}
            <span className="italic text-primary">filed business</span> — in four steps.
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
