import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
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
  ALL_MARKETING_STATES,
  localizedStateName,
  resolveMarketingState,
} from '@/lib/marketing-states';
import { JsonLd, serviceJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { searchParamsToQueryString } from '@/lib/utm';

interface StateLandingPageProps {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function generateStaticParams() {
  // Pre-generate every state slug at build time, including Florida (which
  // redirects to "/") so we never 404 on a known state.
  return ALL_MARKETING_STATES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: StateLandingPageProps): Promise<Metadata> {
  const state = resolveMarketingState(params.slug);
  if (state.slug !== params.slug.toLowerCase()) {
    return {};
  }
  const locale = await getLocale();
  if (state.availability === 'active') {
    const title = `LaunchForma · Form your ${state.name} business in minutes`;
    const description = `Form a ${state.name} LLC or Corporation with all-in package pricing, free Year-1 Registered Agent, and same-business-day filing.`;
    const canonical = `/states/${state.slug}`;
    return {
      title,
      description,
      openGraph: { title, description, type: 'website' },
      alternates: {
        canonical,
        languages: {
          'en-US': canonical,
          es: `${canonical}?lang=es`,
          'x-default': canonical,
        },
      },
    };
  }
  const t = await getTranslations({ locale, namespace: 'comingSoon' });
  const stateName = localizedStateName(state, locale);
  const title = `${t('heroHeadlineLine1', { state: stateName })} ${t('heroHeadlineLine2')}`;
  return {
    title,
    description: t('heroSubhead', { state: stateName }),
    openGraph: { title, type: 'website' },
    alternates: { canonical: `/states/${state.slug}` },
    // Coming-soon pages are near-duplicate templated content — keep them out
    // of the index (still crawlable for the waitlist links) to avoid a
    // thin-content footprint across ~47 state slugs.
    robots: { index: false, follow: true },
  };
}

export default function StateLandingPage({
  params,
  searchParams,
}: StateLandingPageProps) {
  const state = resolveMarketingState(params.slug);

  // The slug must exactly match a known state; otherwise 404 instead of
  // silently falling back to Florida (which would let any garbage slug
  // resolve to "/").
  if (state.slug !== params.slug.toLowerCase()) {
    notFound();
  }

  // Florida already lives at "/", so redirect anyone hitting /states/florida
  // to the canonical homepage — but preserve ?lang=, utm_*, and any other
  // query params so ad campaigns land with attribution intact.
  if (state.code === 'FL') {
    const qs = searchParamsToQueryString(searchParams);
    redirect(qs ? `/?${qs}` : '/');
  }

  // Active formation state (WY/DE) — render the full marketing layout with
  // state-aware hero, pricing footnote, FAQ, and CTA.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

  if (state.availability === 'active') {
    return (
      <>
        <JsonLd data={serviceJsonLd(state.name, state.slug)} />
        <JsonLd
          data={breadcrumbJsonLd([
            { name: 'Home', url: baseUrl },
            { name: state.name, url: `${baseUrl}/states/${state.slug}` },
          ])}
        />
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

  return (
    <ComingSoonLanding
      state={state}
      campaign={pickFirst(searchParams?.utm_campaign)}
    />
  );
}
