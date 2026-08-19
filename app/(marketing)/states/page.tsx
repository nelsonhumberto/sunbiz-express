import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MapPin, Clock, ShieldCheck } from 'lucide-react';
import { getLocale } from 'next-intl/server';
import {
  ACTIVE_MARKETING_STATES,
  ALL_MARKETING_STATES,
  localizedStateName,
} from '@/lib/marketing-states';
import { getFormationState, type StateCode } from '@/lib/formation-states';
import { tierPackagePriceCents } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { CTABanner } from '@/components/marketing/CTABanner';

export const metadata: Metadata = {
  title: 'States We Serve - LLC & Corporation Formation',
  description:
    'LaunchForma files LLCs and Corporations in Florida, Wyoming, and Delaware today, with more states rolling out. Compare timing, state fees, and what is included by state.',
  alternates: { canonical: '/states' },
  openGraph: {
    title: 'States We Serve - LaunchForma',
    description:
      'Form a business in Florida, Wyoming, or Delaware - same all-in pricing, free Year-1 Registered Agent, transparent state fees.',
    type: 'website',
  },
};

export default async function StatesIndexPage() {
  const locale = await getLocale();
  const comingSoon = ALL_MARKETING_STATES.filter(
    (s) => s.availability === 'coming_soon',
  );

  return (
    <>
      <section className="pt-16 pb-10">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            States we serve
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            Form your business in{' '}
            <span className="italic text-primary">your state.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            We file LLCs and Corporations in Florida, Wyoming, and Delaware today.
            Other US states are rolling out next - pick yours to join the waitlist.
          </p>
        </div>
      </section>

      <section className="py-8">
        <div className="container max-w-6xl">
          <h2 className="font-display text-2xl font-medium mb-6">
            Available today
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {ACTIVE_MARKETING_STATES.map((state) => {
              const rule = getFormationState(state.code);
              const llcPrice = tierPackagePriceCents(
                'BASIC',
                'LLC',
                state.code as StateCode,
              );
              const href = state.code === 'FL' ? '/' : `/states/${state.slug}`;
              return (
                <Link
                  key={state.code}
                  href={href}
                  className="group rounded-2xl border border-border bg-white p-6 hover:border-primary/40 hover:shadow-card transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-success bg-success-subtle px-2.5 py-1 rounded-full">
                      Live
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-medium">
                    {localizedStateName(state, locale)}
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Form a {state.name} LLC or Corporation with all-in pricing.
                  </p>

                  <ul className="mt-5 space-y-2 text-sm text-ink-muted">
                    <li className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      {rule.marketingTiming.badgeFallback}
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Free Year-1 Registered Agent
                    </li>
                    <li className="flex items-center gap-2 font-medium text-ink">
                      Starts at {formatCurrency(llcPrice)} all-in (LLC)
                    </li>
                  </ul>

                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                    Get started in {state.name}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container max-w-6xl">
          <h2 className="font-display text-2xl font-medium mb-2">
            Rolling out next
          </h2>
          <p className="text-sm text-ink-muted mb-6">
            Pick your state to join the early-access list - we&apos;ll email you
            the moment filings open.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {comingSoon.map((state) => (
              <Link
                key={state.code}
                href={`/states/${state.slug}`}
                className="px-3 py-2.5 rounded-md border border-border bg-white text-sm text-ink-muted hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                {localizedStateName(state, locale)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTABanner />
    </>
  );
}
