import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';

export const metadata = { title: 'FAQ' };

export default function FAQPage() {
  return (
    <>
      <section className="pt-16 pb-4">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Frequently asked questions
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            Got questions?{' '}
            <span className="italic">We've got answers.</span>
          </h1>
        </div>
      </section>
      <FAQSection />
      <CTABanner />
    </>
  );
}
