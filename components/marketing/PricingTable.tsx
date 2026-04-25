'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Minus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIERS } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface PricingTableProps {
  showHeader?: boolean;
  className?: string;
}

export function PricingTable({ showHeader = true, className }: PricingTableProps) {
  return (
    <section id="pricing" className={cn('py-20 md:py-28', className)}>
      <div className="container">
        {showHeader && (
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Transparent Pricing
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
              Pick a plan. Pay once. Done.
            </h2>
            <p className="mt-4 text-lg text-ink-muted leading-relaxed">
              No subscriptions. No hidden fees. The state filing fee is shown separately so you
              always know what you're paying.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.slug}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={cn(
                'relative rounded-2xl bg-white border transition-all duration-300',
                tier.recommended
                  ? 'border-primary shadow-glow lg:scale-[1.03] lg:-mt-2'
                  : 'border-border shadow-soft hover:shadow-card hover:-translate-y-1'
              )}
            >
              {tier.ribbon && (
                <div
                  className={cn(
                    'absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wider',
                    tier.recommended
                      ? 'bg-primary text-white'
                      : 'bg-gradient-gold text-white shadow-md'
                  )}
                >
                  {tier.recommended ? <><Sparkles className="inline h-3 w-3 mb-0.5 mr-1" /> {tier.ribbon}</> : tier.ribbon}
                </div>
              )}

              <div className="p-8">
                <h3 className="font-display text-2xl font-medium">{tier.name}</h3>
                <p className="mt-1.5 text-sm text-ink-muted leading-snug min-h-[40px]">
                  {tier.description}
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-5xl font-medium">
                    {tier.basePriceCents === 0 ? '$0' : formatCurrency(tier.basePriceCents)}
                  </span>
                  <span className="text-ink-subtle text-sm">+ state fees</span>
                </div>

                <Button
                  asChild
                  size="lg"
                  variant={tier.recommended ? 'default' : 'outline'}
                  className="mt-6 w-full"
                >
                  <Link href={`/sign-up?tier=${tier.slug}`}>
                    {tier.basePriceCents === 0 ? 'Start free' : `Choose ${tier.name}`}
                  </Link>
                </Button>
              </div>

              <div className="border-t border-border p-8 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  What's included
                </p>
                <ul className="space-y-2.5">
                  {tier.features.map((feat) => (
                    <li
                      key={feat.label}
                      className={cn(
                        'flex items-start gap-2.5 text-sm leading-snug',
                        !feat.included && 'text-ink-subtle'
                      )}
                    >
                      {feat.included ? (
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0 mt-0.5',
                            feat.highlight ? 'text-accent' : 'text-primary'
                          )}
                          strokeWidth={3}
                        />
                      ) : (
                        <Minus className="h-4 w-4 shrink-0 mt-0.5 text-ink-subtle" />
                      )}
                      <span className={feat.highlight ? 'font-semibold text-ink' : ''}>
                        {feat.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-xs text-ink-subtle mt-10">
          Florida state filing fee: <strong>$125</strong> for LLC · <strong>$70</strong> for Corporation. Paid directly to the State of Florida.
        </p>
      </div>
    </section>
  );
}
