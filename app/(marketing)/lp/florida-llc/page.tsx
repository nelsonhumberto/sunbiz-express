import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { MIAMI_LAKES_EN } from '@/components/marketing/FloridaLlcLanding';
import { auth } from '@/lib/auth';
import { FloridaLlcLanding } from '@/components/marketing/FloridaLlcLanding';
import { FAQSection } from '@/components/marketing/FAQSection';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { adsActorForUser } from '@/lib/ads-actor';
import { floridaOnlyNote } from '@/lib/formation-states';
import { withLocaleMeta } from '@/lib/locale-seo';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { FLORIDA, localizedStateName } from '@/lib/marketing-states';
import { tierFromLandingSearch } from '@/lib/lp-tier';
import { searchParamsToQueryString } from '@/lib/utm';

export const dynamic = 'force-dynamic';

interface LandingProps {
  searchParams?: Record<string, string | string[] | undefined>;
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * English document requests can arrive with an empty searchParams object
 * even when the address bar has ?tier=. The Spanish rewrite keeps that
 * query. Read the raw search forwarded by middleware when the prop is empty.
 */
function landingTier(
  searchParams?: Record<string, string | string[] | undefined>,
  searchHeader?: string | null,
): string | undefined {
  return pickFirst(searchParams?.tier) ?? tierFromLandingSearch(searchHeader);
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations('offer');
  const tStart = await getTranslations('start');
  const stateName = localizedStateName(FLORIDA, locale);
  const title = tStart('headline', { state: stateName, entity: tStart('entityLLC') });
  const description = t('metaDescription');
  return withLocaleMeta(
    '/lp/florida-llc',
    {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: { title, description, type: 'website' },
    },
    locale,
  );
}

export default async function FloridaLlcLandingPage({ searchParams }: LandingProps) {
  const locale = await getLocale();
  const tDisc = await getTranslations('disclosure');
  const session = await auth();
  const actor = await adsActorForUser(session?.user?.id, session?.user?.email);
  const stateName = localizedStateName(FLORIDA, locale);
  const faq = getMarketingFaq(FLORIDA, locale);
  const tNiche = await getTranslations('nicheStylists');
  const tHero = await getTranslations('hero');
  const trustLines =
    locale === 'es'
      ? [
          tNiche('subhead'),
          (await getTranslations('guideLlcSinSsn'))('ctaSubhead'),
          tHero('previewBankReadyDetail'),
        ]
      : [tNiche('subhead'), MIAMI_LAKES_EN, tHero('previewBankReadyDetail')];

  return (
    <>
      <JsonLd data={faqPageJsonLd(faq)} />
      <FloridaLlcLanding
        attributionSearch={searchParamsToQueryString(searchParams)}
        initialTier={landingTier(searchParams, headers().get('x-lf-search'))}
        floridaNote={floridaOnlyNote(locale)}
        stateName={stateName}
        accountEmail={actor.email}
        isTester={actor.isTester}
        trustLines={trustLines}
      />
      <FAQSection state={FLORIDA} suppressJsonLd />
      <div className="container max-w-lg px-4 pb-16">
        <GovDisclosure variant="prominent" text={tDisc('notAffiliated')} />
      </div>
    </>
  );
}
