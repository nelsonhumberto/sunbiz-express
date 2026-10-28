import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Hero } from '@/components/marketing/Hero';
import { StatsBar } from '@/components/marketing/StatsBar';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { SpanishSsnGuideLink } from '@/components/marketing/SpanishSsnGuideLink';
import { AnnualReportSection } from '@/components/marketing/AnnualReportSection';
import { ComingSoonLanding } from '@/components/marketing/ComingSoonLanding';
import {
  localizedStateName,
  marketingStateForVisitor,
} from '@/lib/marketing-states';
import { floridaOnlyNote } from '@/lib/formation-states';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { robotsForMarketingState } from '@/lib/marketing-robots';
import { retiredStateDestination } from '@/lib/retired-state-redirects';
import { homeTitlePhrase, pageTitle, withBrand } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';

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
  const { state } = marketingStateForVisitor(stateParam);
  const locale = await getLocale();

  if (state.availability === 'active') {
    const stateName = localizedStateName(state, locale);
    const tMeta = locale === 'es' ? await getTranslations('homeMeta') : null;
    const phrase = tMeta
      ? state.code === 'FL'
        ? tMeta('titleFl')
        : tMeta('titleState', { state: stateName })
      : homeTitlePhrase(state.name, state.code);
    const description = tMeta
      ? tMeta('description', { state: stateName })
      : `Start your ${state.name} LLC or Corporation online in minutes. We prepare and file with the state on your behalf within 1 business day. Free Year-1 Registered Agent and transparent all-in pricing. A private filing service, not a government agency. No hidden fees.`;
    // Florida is the self-canonical homepage. A retired state slug (Delaware,
    // Wyoming) points at the Florida state page those URLs 308 to, so the
    // canonical does not name a redirect source.
    const dedicated = state.code === 'FL' ? '/' : `/states/${state.slug}`;
    const englishPath = retiredStateDestination(dedicated) ?? dedicated;
    return withLocaleMeta(
      englishPath,
      {
        title: pageTitle(phrase),
        description,
        openGraph: {
          title: withBrand(phrase),
          description,
          type: 'website',
        },
      },
      locale,
    );
  }

  const t = await getTranslations({ locale, namespace: 'comingSoon' });
  const stateName = localizedStateName(state, locale);
  const phrase = `${t('heroHeadlineLine1', { state: stateName })} ${t('heroHeadlineLine2')}`;
  const description = t('heroSubhead', { state: stateName });

  return withLocaleMeta(
    `/?state=${state.code}`,
    {
      title: pageTitle(phrase),
      description,
      openGraph: {
        title: phrase,
        description,
        type: 'website',
      },
      robots: robotsForMarketingState(state),
    },
    locale,
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: HomePageSearchParams;
}) {
  const stateParam = pickFirst(searchParams?.state);
  const resolved = marketingStateForVisitor(stateParam);
  const state = resolved.state;
  const campaign = pickFirst(searchParams?.utm_campaign);

  if (state.availability !== 'active') {
    return <ComingSoonLanding state={state} campaign={campaign} />;
  }

  const locale = await getLocale();
  const faqItems = getMarketingFaq(state, locale);
  const stateNote = resolved.fellBackFromInactive ? floridaOnlyNote(locale) : null;

  return (
    <>
      <JsonLd data={faqPageJsonLd(faqItems)} />
      {stateNote ? (
        <p role="status" className="container pt-6 text-center text-sm text-ink-muted">
          {stateNote}
        </p>
      ) : null}
      <Hero state={state} />
      <StatsBar />
      <FeatureGrid state={state} />
      <HowItWorks state={state} />
      <PricingTable state={state} />
      <ComparisonTable />
      <AnnualReportSection state={state} />
      <FAQSection state={state} suppressJsonLd />
      <SpanishSsnGuideLink />
      <CTABanner state={state} />
    </>
  );
}
