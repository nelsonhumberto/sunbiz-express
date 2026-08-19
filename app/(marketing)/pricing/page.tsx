import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { resolveMarketingState } from '@/lib/marketing-states';
import { TIERS, tierPackagePriceCents, type TierSlug } from '@/lib/pricing';
import { type StateCode } from '@/lib/formation-states';
import { JsonLd, pricingProductJsonLd } from '@/components/seo/JsonLd';

interface PricingPageProps {
  searchParams?: { state?: string | string[] };
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function generateMetadata({
  searchParams,
}: PricingPageProps): Promise<Metadata> {
  const explicitState = pickFirst(searchParams?.state);
  const preferred = cookies().get('preferred_state')?.value;
  const state = resolveMarketingState(explicitState ?? preferred);
  // Self-canonical avoids duplicate-content signals from `?state=` query
  // permutations. The canonical always points at the bare `/pricing` URL
  // for FL and a state-scoped form for WY/DE.
  const canonical =
    state.code === 'FL' ? '/pricing' : `/pricing?state=${state.code}`;
  const title =
    state.code === 'FL'
      ? 'LLC & Corporation Formation Pricing - All-In, No Hidden Fees'
      : `${state.name} LLC & Corporation Formation Pricing - All-In Packages`;
  const description =
    state.code === 'FL'
      ? 'Florida LLC and Corporation formation packages from $149 all-in. State filing fee included, free Year-1 Registered Agent, EIN, Operating Agreement, BOI filing - no surprise checkout fees.'
      : `${state.name} LLC and Corporation formation pricing with the ${state.name} filing fee included. Free Year-1 Registered Agent, transparent all-in pricing, no upsell tricks.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const t = await getTranslations('pricing');
  const explicitState = pickFirst(searchParams?.state);
  const preferred = cookies().get('preferred_state')?.value;
  const state = resolveMarketingState(explicitState ?? preferred);

  // Build pricing schema from the live tier catalog so search rich
  // results never drift away from what we actually charge.
  const stateCode = state.code as StateCode;
  const tiersForSchema = TIERS.map((tier) => ({
    name: tier.name,
    priceCents: tierPackagePriceCents(
      tier.slug as TierSlug,
      'LLC',
      stateCode,
    ),
    description: tier.description,
  }));

  return (
    <>
      <JsonLd
        data={pricingProductJsonLd({
          stateName: state.name,
          tiers: tiersForSchema,
        })}
      />
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
