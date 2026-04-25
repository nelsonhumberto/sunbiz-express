'use client';

import { motion } from 'framer-motion';

const STATS = [
  { number: '2,400+', label: 'Businesses formed' },
  { number: '15 min', label: 'Average filing time' },
  { number: '4.9 / 5', label: 'Customer rating' },
  { number: '< 1 day', label: 'State approval' },
];

export function StatsBar() {
  return (
    <section className="py-12 border-y border-border bg-white">
      <div className="container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="font-display text-3xl md:text-4xl font-medium gradient-text">
                {stat.number}
              </div>
              <div className="mt-1 text-xs md:text-sm text-ink-muted font-medium uppercase tracking-wider">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
