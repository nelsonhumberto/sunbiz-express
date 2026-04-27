import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { StateWaitlistForm } from '@/components/marketing/StateWaitlistForm';
import {
  localizedStateName,
  resolveMarketingState,
} from '@/lib/marketing-states';

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
    return { title: 'FAQ' };
  }
  const stateName = localizedStateName(state, locale);
  return {
    title: `${stateName} FAQ`,
    robots: { index: false, follow: true },
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

  return (
    <>
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
      <FAQSection state={state} />
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
