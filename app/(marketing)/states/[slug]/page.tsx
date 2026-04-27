import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ComingSoonLanding } from '@/components/marketing/ComingSoonLanding';
import {
  ALL_MARKETING_STATES,
  localizedStateName,
  resolveMarketingState,
} from '@/lib/marketing-states';

interface StateLandingPageProps {
  params: { slug: string };
  searchParams?: { utm_campaign?: string | string[] };
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function generateStaticParams() {
  return ALL_MARKETING_STATES.filter((s) => s.availability === 'coming_soon').map(
    (s) => ({ slug: s.slug }),
  );
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
    return { title: 'IncServices' };
  }
  const t = await getTranslations({ locale, namespace: 'comingSoon' });
  const stateName = localizedStateName(state, locale);
  const title = `${t('heroHeadlineLine1', { state: stateName })} ${t('heroHeadlineLine2')}`;
  return {
    title,
    description: t('heroSubhead', { state: stateName }),
    openGraph: { title, type: 'website' },
    alternates: { canonical: `/states/${state.slug}` },
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
  // to the canonical homepage.
  if (state.availability === 'active') {
    redirect('/');
  }

  return (
    <ComingSoonLanding
      state={state}
      campaign={pickFirst(searchParams?.utm_campaign)}
    />
  );
}
