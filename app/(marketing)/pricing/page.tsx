import { getTranslations } from 'next-intl/server';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';

export const metadata = { title: 'Pricing' };

export default async function PricingPage() {
  const t = await getTranslations('pricing');

  return (
    <>
      <section className="pt-16 pb-8">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t('kicker')}
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            {t('headline')}
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">{t('subhead')}</p>
        </div>
      </section>
      <PricingTable showHeader={false} />
      <ComparisonTable />
      <FAQSection />
      <CTABanner />
    </>
  );
}
