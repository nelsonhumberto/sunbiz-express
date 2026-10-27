import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { EnEspanolLinks } from '@/components/marketing/EnEspanolLinks';
import { Hero } from '@/components/marketing/Hero';
import { StatsBar } from '@/components/marketing/StatsBar';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { AnnualReportSection } from '@/components/marketing/AnnualReportSection';
import { ComingSoonLanding } from '@/components/marketing/ComingSoonLanding';
import {
  ALL_MARKETING_STATES,
  localizedStateName,
  resolveMarketingState,
} from '@/lib/marketing-states';
import { JsonLd, serviceJsonLd, breadcrumbJsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { robotsForMarketingState } from '@/lib/marketing-robots';
import { pageTitle, statePageTitlePhrase, withBrand } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';
import { EN_FLORIDA_LICENSE_SPANISH_LINKS } from '@/lib/spanish-guide-links';

interface StateLandingPageProps {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function generateStaticParams() {
  return ALL_MARKETING_STATES.filter((s) => s.availability !== 'inactive').map((s) => ({
    slug: s.slug,
  }));
}

export async function generateMetadata({
  params,
}: StateLandingPageProps): Promise<Metadata> {
  const state = resolveMarketingState(params.slug);
  if (state.slug !== params.slug.toLowerCase() || state.availability === 'inactive') {
    notFound();
  }
  const locale = await getLocale();
  const canonical = `/states/${state.slug}`;
  if (state.availability === 'active') {
    const stateName = localizedStateName(state, locale);
    const phrase =
      locale === 'es'
        ? `Forma una LLC en ${stateName} en línea`
        : statePageTitlePhrase(state.name);
    const description =
      locale === 'es'
        ? `Forma una LLC o corporación en ${stateName} con precio todo incluido, Agente Registrado gratis el primer año y presentación en 1 día hábil.`
        : `Form a ${state.name} LLC or Corporation with all-in package pricing, free Year-1 Registered Agent, and filing within 1 business day.`;
    return withLocaleMeta(
      canonical,
      {
        title: pageTitle(phrase),
        description,
        openGraph: { title: withBrand(phrase), description, type: 'website' },
      },
      locale,
    );
  }
  const t = await getTranslations({ locale, namespace: 'comingSoon' });
  const stateName = localizedStateName(state, locale);
  const phrase = `${t('heroHeadlineLine1', { state: stateName })} ${t('heroHeadlineLine2')}`;
  return withLocaleMeta(
    canonical,
    {
      title: pageTitle(phrase),
      description: t('heroSubhead', { state: stateName }),
      openGraph: { title: phrase, type: 'website' },
      // Coming-soon pages are near-duplicate templated content - keep them out
      // of the index (still crawlable for the waitlist links) to avoid a
      // thin-content footprint across ~47 state slugs.
      robots: robotsForMarketingState(state),
    },
    locale,
  );
}

export default async function StateLandingPage({
  params,
  searchParams,
}: StateLandingPageProps) {
  const state = resolveMarketingState(params.slug);

  // The slug must exactly match a known state; otherwise 404 instead of
  // silently falling back to Florida (which would let any garbage slug
  // resolve to "/").
  if (state.slug !== params.slug.toLowerCase() || state.availability === 'inactive') {
    notFound();
  }

  // Active formation states, including Florida, render the full marketing
  // layout (state-aware hero, pricing, FAQ, and CTA) with a self canonical.
  // The homepage stays at "/".
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

  if (state.availability === 'active') {
    const locale = await getLocale();
    const faqItems = getMarketingFaq(state, locale);
    const prefix = locale === 'es' ? '/es' : '';
    const stateUrl = `${baseUrl}${prefix}/states/${state.slug}`;
    const stateLabel = locale === 'es' ? state.nameEs : state.name;
    return (
      <>
        <JsonLd
          data={serviceJsonLd(stateLabel, state.slug, {
            url: stateUrl,
            name:
              locale === 'es'
                ? `Formación de LLC y corporación en ${stateLabel}`
                : undefined,
            description:
              locale === 'es'
                ? `Forma una LLC o corporación en ${stateLabel} con precio todo incluido, Agente Registrado gratis el primer año y presentación en 1 día hábil.`
                : undefined,
          })}
        />
        <JsonLd
          data={breadcrumbJsonLd([
            { name: locale === 'es' ? 'Inicio' : 'Home', url: locale === 'es' ? `${baseUrl}/es` : baseUrl },
            { name: stateLabel, url: stateUrl },
          ])}
        />
        <JsonLd data={faqPageJsonLd(faqItems)} />
        <Hero state={state} />
        <StatsBar />
        <FeatureGrid state={state} />
        <HowItWorks state={state} />
        <PricingTable state={state} />
        <ComparisonTable />
        <AnnualReportSection state={state} />
        {locale === 'en' && state.slug === 'florida' ? (
          <section className="container max-w-3xl pb-4">
            <EnEspanolLinks heading="En español" links={EN_FLORIDA_LICENSE_SPANISH_LINKS} />
          </section>
        ) : null}
        <FAQSection state={state} suppressJsonLd />
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
