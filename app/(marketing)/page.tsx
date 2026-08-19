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
import { AnnualReportSection } from '@/components/marketing/AnnualReportSection';
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
    const stateName = localizedStateName(state, locale);
    const title = `LaunchForma | Form a ${stateName} LLC & Incorporate Your Business`;
    const description = `Start your ${stateName} LLC or Corporation online in minutes. We prepare and file with the state on your behalf - same-day filing, free Year-1 Registered Agent, EIN application, and transparent all-in pricing. A private filing service, not a government agency. No hidden fees.`;
    // Consolidate WY/DE: the ?state= homepage variant points its canonical at
    // the dedicated /states/{slug} page so search engines don't index two URLs
    // for the same content.
    const canonical = state.code === 'FL' ? '/' : `/states/${state.slug}`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
      },
      alternates: {
        canonical,
        languages: {
          'en-US': canonical,
          es: `${canonical}${canonical.includes('?') ? '&' : '?'}lang=es`,
          'x-default': canonical,
        },
      },
    };
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
      <FeatureGrid state={state} />
      <HowItWorks state={state} />
      <PricingTable state={state} />
      <ComparisonTable />
      <AnnualReportSection state={state} />
      <Testimonials state={state} />
      <FAQSection state={state} />
      <CTABanner state={state} />
    </>
  );
}
