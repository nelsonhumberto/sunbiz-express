import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { resolveMarketingState } from '@/lib/marketing-states';

interface PricingPageProps {
  searchParams?: { state?: string | string[] };
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export const metadata = { title: 'Pricing' };

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const t = await getTranslations('pricing');
  const explicitState = pickFirst(searchParams?.state);
  const preferred = cookies().get('preferred_state')?.value;
  const state = resolveMarketingState(explicitState ?? preferred);

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
      <PricingTable showHeader={false} state={state} />
      <ComparisonTable />
      <FAQSection state={state} />
      <CTABanner state={state} />
    </>
  );
}
