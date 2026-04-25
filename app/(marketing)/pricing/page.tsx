import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';

export const metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <>
      <section className="pt-16 pb-8">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Transparent pricing
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            One clear price.{' '}
            <span className="italic">No surprises.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            Florida charges a state filing fee that goes directly to the Department of State. We
            charge a service fee — clearly itemized so you always know what you're paying for.
          </p>
        </div>
      </section>
      <PricingTable showHeader={false} />
      <ComparisonTable />
      <FAQSection />
      <CTABanner />
    </>
  );
}
