'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const TESTIMONIALS = [
  {
    quote:
      "I'd done LegalZoom twice and dreaded it both times. Sunbiz Express felt like ordering a sandwich — pick what you want, pay once, done.",
    name: 'Mariana C.',
    role: 'Founder · Coral Gables Realty Group',
    avatar: 'MC',
  },
  {
    quote:
      'The annual report reminders alone are worth it. Last year I almost missed the May 1st deadline — that $400 late fee would have stung.',
    name: 'James T.',
    role: 'Solopreneur · Tampa, FL',
    avatar: 'JT',
  },
  {
    quote:
      'I needed an Operating Agreement my bank would actually accept. Sunbiz Express delivered one in the format Wells Fargo wanted on the first try.',
    name: 'Aisha N.',
    role: 'Co-Founder · Brickell Capital LLC',
    avatar: 'AN',
  },
  {
    quote:
      'Filed on Tuesday morning, approved Wednesday afternoon. The email update with my Sunbiz number arrived before my coffee got cold.',
    name: 'David K.',
    role: 'Owner · Sunshine Coast Logistics',
    avatar: 'DK',
  },
  {
    quote:
      "The transparency hit different. I knew exactly what was a state fee versus a service fee — no shell game like every competitor I'd used.",
    name: 'Priya R.',
    role: 'Independent Consultant · Orlando',
    avatar: 'PR',
  },
  {
    quote:
      'I formed three LLCs in one weekend for a real-estate syndication. The dashboard kept everything organized — could not have done that with paper forms.',
    name: 'Marcus B.',
    role: 'Real Estate Investor · Naples',
    avatar: 'MB',
  },
];

export function Testimonials() {
  return (
    <section className="py-20 md:py-28 bg-white border-y border-border">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="h-5 w-5 text-accent fill-accent" />
            ))}
            <span className="ml-2 text-sm font-semibold">4.9 / 5 average</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
            Loved by Florida{' '}
            <span className="italic text-primary">entrepreneurs.</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            From solopreneurs to real-estate syndicators — over 2,400 Floridians filed with us this
            year.
          </p>
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 max-w-6xl mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="break-inside-avoid mb-6 rounded-2xl border border-border bg-white p-6 shadow-soft hover:shadow-card transition-shadow"
            >
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="h-3.5 w-3.5 text-accent fill-accent" />
                ))}
              </div>
              <p className="text-sm text-ink leading-relaxed">"{t.quote}"</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-hover text-white flex items-center justify-center text-sm font-semibold">
                  {t.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink leading-tight">{t.name}</p>
                  <p className="text-xs text-ink-muted leading-tight">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
