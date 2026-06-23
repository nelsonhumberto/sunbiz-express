import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, ArrowRight, Clock, ShieldCheck, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatsBar } from '@/components/marketing/StatsBar';
import { PricingTable } from '@/components/marketing/PricingTable';
import { Testimonials } from '@/components/marketing/Testimonials';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { resolveMarketingState } from '@/lib/marketing-states';

interface OfferPageProps {
  searchParams?: { state?: string | string[]; tier?: string | string[] };
}

function pickFirst(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Paid-traffic landing page. Deliberately noindex to avoid duplicate-content
// competition with /pricing and the homepage; it exists to convert cold ad
// clicks, not to rank. Every CTA drops straight into the guest flow (/start).
export const metadata: Metadata = {
  title: 'Form your business the easy way — all-in pricing, no surprises',
  description:
    'Pick a package, answer a few questions, and we file with the state the same business day. Free Year-1 Registered Agent and all state fees included.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/offer' },
};

export default function OfferPage({ searchParams }: OfferPageProps) {
  const state = resolveMarketingState(pickFirst(searchParams?.state));
  const tier = pickFirst(searchParams?.tier);
  const startHref = `/start?state=${state.code}${tier ? `&tier=${tier}` : ''}`;
  const stateName = state.name;

  return (
    <>
      {/* ── Offer hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-14 pb-12 md:pt-20 md:pb-16">
        <div className="absolute inset-0 mesh-bg" />
        <div className="aurora" />
        <div className="container relative max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Clock className="h-3.5 w-3.5" />
            Same business day filing
          </span>
          <h1 className="mt-4 font-display text-4xl md:text-6xl font-medium tracking-tight text-balance">
            Form your {stateName} business{' '}
            <span className="italic text-primary">without the busywork</span>
          </h1>
          <p className="mt-4 text-lg text-ink-muted leading-relaxed max-w-xl mx-auto">
            Pick a package, answer a few quick questions, and we prepare and
            file your formation with the state — usually the same business day.
            No account or credit card needed to start.
          </p>

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink">
            {[
              'All state fees included',
              'Free Year-1 Registered Agent',
              'No hidden checkout fees',
            ].map((point) => (
              <li key={point} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="xl" className="text-base shadow-xl">
              <Link href={startHref}>
                Start my filing
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button asChild size="xl" variant="outline" className="text-base">
              <Link href="#packages">See packages</Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-subtle">
            14-day money-back guarantee on our service fee.
          </p>
        </div>
      </section>

      <StatsBar />

      {/* ── Trust band ─────────────────────────────────────────────── */}
      <section className="py-10">
        <div className="container grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl">
          <TrustItem
            icon={<Clock className="h-5 w-5 text-primary" />}
            title="Same-day submission"
            body="Finish in minutes — we submit to the state the same business day."
          />
          <TrustItem
            icon={<ShieldCheck className="h-5 w-5 text-primary" />}
            title="Free Registered Agent"
            body="Your first year of Registered Agent service is included, free."
          />
          <TrustItem
            icon={<Landmark className="h-5 w-5 text-primary" />}
            title="Bank-ready"
            body="EIN, Operating Agreement, and BOI handled so you can open an account."
          />
        </div>
      </section>

      <div id="packages" className="scroll-mt-20">
        <PricingTable state={state} />
      </div>

      <Testimonials state={state} />
      <FAQSection state={state} expandAll suppressJsonLd />
      <CTABanner state={state} />
    </>
  );
}

function TrustItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-soft">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-3 font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}
