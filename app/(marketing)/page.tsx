import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Hero } from '@/components/marketing/Hero';
import { StatsBar } from '@/components/marketing/StatsBar';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { Testimonials } from '@/components/marketing/Testimonials';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { ComingSoonLanding } from '@/components/marketing/ComingSoonLanding';
import {
  localizedStateName,
  resolveMarketingState,
} from '@/lib/marketing-states';

interface HomePageSearchParams {
  state?: string | string[];
  utm_campaign?: string | string[];
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: HomePageSearchParams;
}): Promise<Metadata> {
  const stateParam = pickFirst(searchParams?.state);
  const state = resolveMarketingState(stateParam);
  const locale = await getLocale();

  if (state.availability === 'active') {
    return {};
  }

  const t = await getTranslations({ locale, namespace: 'comingSoon' });
  const stateName = localizedStateName(state, locale);
  const title = `${t('heroHeadlineLine1', { state: stateName })} ${t('heroHeadlineLine2')}`;
  const description = t('heroSubhead', { state: stateName });

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    alternates: {
      canonical: `/?state=${state.code}`,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default function HomePage({
  searchParams,
}: {
  searchParams?: HomePageSearchParams;
}) {
  const stateParam = pickFirst(searchParams?.state);
  const state = resolveMarketingState(stateParam);
  const campaign = pickFirst(searchParams?.utm_campaign);

  if (state.availability !== 'active') {
    return <ComingSoonLanding state={state} campaign={campaign} />;
  }

  return (
    <>
      <Hero state={state} />
      <StatsBar />
      <FeatureGrid />
      <HowItWorks />
      <PricingTable />
      <ComparisonTable />
      <Testimonials />
      <FAQSection state={state} />
      <CTABanner state={state} />
    </>
  );
}
