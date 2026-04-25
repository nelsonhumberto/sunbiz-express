'use client';

import { Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Row {
  label: string;
  values: (boolean | string)[];
}

const COMPETITORS = ['Sunbiz Express', 'LegalZoom', 'ZenBusiness', 'Bizee'];

const ROWS: Row[] = [
  {
    label: 'Free Year-1 Registered Agent',
    values: [true, false, '$199/yr', true],
  },
  {
    label: 'EIN included',
    values: [true, '$99', true, '$199+ tier'],
  },
  {
    label: '1-day expedited as standard',
    values: [true, '$249 tier', true, true],
  },
  {
    label: 'Itemized state vs service fees',
    values: [true, false, false, false],
  },
  {
    label: 'No upsell carousel',
    values: [true, false, false, false],
  },
  {
    label: 'Operating Agreement',
    values: [true, '$99', true, true],
  },
  {
    label: 'Annual report reminders',
    values: [true, '$99/yr', '$199/yr', '$99/yr'],
  },
  {
    label: 'Privacy-first (no data sales)',
    values: [true, false, false, true],
  },
];

export function ComparisonTable() {
  return (
    <section className="py-20 md:py-28">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Honest comparison
          </span>
          <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
            See how we{' '}
            <span className="italic text-primary">stack up.</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            We did the homework so you don't have to. Pricing reflects standard formation tiers as of 2026.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border bg-white shadow-card overflow-hidden max-w-5xl mx-auto"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-4 font-medium text-ink-muted w-1/3">Feature</th>
                  {COMPETITORS.map((c, i) => (
                    <th
                      key={c}
                      className={cn(
                        'p-4 text-center text-sm font-semibold',
                        i === 0 ? 'text-primary' : 'text-ink-muted'
                      )}
                    >
                      {i === 0 && (
                        <div className="inline-block px-2 py-0.5 mb-1 rounded-full bg-primary/10 text-[10px] font-semibold uppercase tracking-wider">
                          Us
                        </div>
                      )}
                      <div>{c}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, idx) => (
                  <tr
                    key={row.label}
                    className={cn(
                      'border-b border-border last:border-b-0',
                      idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'
                    )}
                  >
                    <td className="p-4 text-ink font-medium">{row.label}</td>
                    {row.values.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          'p-4 text-center',
                          i === 0 ? 'bg-primary/5' : ''
                        )}
                      >
                        {typeof v === 'boolean' ? (
                          v ? (
                            <Check
                              className={cn('mx-auto h-5 w-5', i === 0 ? 'text-primary' : 'text-success')}
                              strokeWidth={3}
                            />
                          ) : (
                            <X className="mx-auto h-5 w-5 text-ink-subtle/60" strokeWidth={2} />
                          )
                        ) : (
                          <span className="text-xs text-ink-muted">{v}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
