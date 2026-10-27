import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { StateWaitlistForm } from '@/components/marketing/StateWaitlistForm';
import {
  localizedStateName,
  marketingStateForVisitor,
} from '@/lib/marketing-states';
import { floridaOnlyNote } from '@/lib/formation-states';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { robotsForMarketingState } from '@/lib/marketing-robots';
import { withLocaleMeta } from '@/lib/locale-seo';

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
  const { state } = marketingStateForVisitor(pickFirst(searchParams?.state));
  const locale = await getLocale();
  const tMeta = locale === 'es' ? await getTranslations('faqMeta') : null;
  if (state.availability === 'active') {
    const stateName = localizedStateName(state, locale);
    const canonical =
      state.code === 'FL' ? '/faq' : `/faq?state=${state.code}`;
    const title = tMeta
      ? state.code === 'FL'
        ? tMeta('titleFl')
        : tMeta('titleState', { state: stateName })
      : state.code === 'FL'
        ? 'LLC & Corporation Formation FAQ - Pricing, Timing, Registered Agent'
        : `${stateName} LLC & Corporation FAQ - Pricing, Timing, Compliance`;
    const description = tMeta
      ? state.code === 'FL'
        ? tMeta('descFl')
        : tMeta('descState', { state: stateName })
      : state.code === 'FL'
        ? 'Answers about LaunchForma packages, Florida filing timing, Registered Agent, annual reports, and refund policy.'
        : `Answers about LaunchForma packages for ${stateName} - filing timing, Registered Agent, annual compliance, and refunds.`;
    return withLocaleMeta(
      canonical,
      {
        title,
        description,
        openGraph: { title, description, type: 'website' },
      },
      locale,
    );
  }
  const stateName = localizedStateName(state, locale);
  return withLocaleMeta(
    `/faq?state=${state.code}`,
    {
      title: tMeta
        ? tMeta('comingTitle', { state: stateName })
        : `${stateName} formation FAQ - coming soon`,
      description: tMeta
        ? tMeta('comingDesc', { state: stateName })
        : `LaunchForma is rolling out ${state.name} business formations. Join the early-access list to get notified when it opens.`,
      robots: robotsForMarketingState(state),
    },
    locale,
  );
}

export default async function FAQPage({ searchParams }: FAQPageProps) {
  const resolved = marketingStateForVisitor(pickFirst(searchParams?.state));
  const state = resolved.state;
  const locale = await getLocale();
  const stateNote = resolved.fellBackFromInactive ? floridaOnlyNote(locale) : null;
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
              ? t('pageHeadline', { state: stateName })
              : tComingSoon('faqHeadline', { state: stateName })}
          </h1>
          {stateNote ? (
            <p role="status" className="mt-4 text-sm text-ink-muted">
              {stateNote}
            </p>
          ) : null}
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
