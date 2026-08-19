import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { StateWaitlistForm } from '@/components/marketing/StateWaitlistForm';
import {
  localizedStateName,
  resolveMarketingState,
} from '@/lib/marketing-states';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';

interface FAQPageProps {
  searchParams?: { state?: string | string[] };
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function generateMetadata({
  searchParams,
}: FAQPageProps): Promise<Metadata> {
  const state = resolveMarketingState(pickFirst(searchParams?.state));
  const locale = await getLocale();
  if (state.availability === 'active') {
    const stateName = localizedStateName(state, locale);
    const canonical =
      state.code === 'FL' ? '/faq' : `/faq?state=${state.code}`;
    const title =
      state.code === 'FL'
        ? 'LLC & Corporation Formation FAQ - Pricing, Timing, Registered Agent, BOI'
        : `${stateName} LLC & Corporation FAQ - Pricing, Timing, Compliance`;
    const description =
      state.code === 'FL'
        ? 'Answers about LaunchForma packages, Florida filing timing, Registered Agent, EIN, annual reports, BOI/FinCEN, and refund policy.'
        : `Answers about LaunchForma packages for ${stateName} - filing timing, Registered Agent, EIN, annual compliance, BOI/FinCEN, and refunds.`;
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, type: 'website' },
    };
  }
  const stateName = localizedStateName(state, locale);
  return {
    title: `${stateName} formation FAQ - coming soon`,
    description: `LaunchForma is rolling out ${stateName} business formations. Join the early-access list to get notified when it opens.`,
    robots: { index: false, follow: true },
    alternates: { canonical: `/faq?state=${state.code}` },
  };
}

export default async function FAQPage({ searchParams }: FAQPageProps) {
  const state = resolveMarketingState(pickFirst(searchParams?.state));
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'faq' });
  const tComingSoon = await getTranslations({
    locale,
    namespace: 'comingSoon',
  });
  const stateName = localizedStateName(state, locale);
  const isActive = state.availability === 'active';
  // Emit the FAQPage structured data from the server component so it is in the
  // initial HTML for every indexable state, independent of the client
  // accordion. FAQSection suppresses its own copy to avoid duplicate schema.
  const faqItems = getMarketingFaq(state, locale);

  return (
    <>
      {isActive && <JsonLd data={faqPageJsonLd(faqItems)} />}
      <section className="pt-16 pb-4">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {isActive ? t('kicker') : tComingSoon('faqEyebrow')}
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            {isActive
              ? t('headline')
              : tComingSoon('faqHeadline', { state: stateName })}
          </h1>
        </div>
      </section>
      <FAQSection state={state} hideHeading expandAll suppressJsonLd />
      {isActive ? (
        <CTABanner state={state} />
      ) : (
        <section className="py-12 md:py-16">
          <div className="container max-w-2xl">
            <StateWaitlistForm state={state} source="faq" />
          </div>
        </section>
      )}
    </>
  );
}
