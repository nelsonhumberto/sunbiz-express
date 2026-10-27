import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { PricingTable } from '@/components/marketing/PricingTable';
import { ComparisonTable } from '@/components/marketing/ComparisonTable';
import { FAQSection } from '@/components/marketing/FAQSection';
import { CTABanner } from '@/components/marketing/CTABanner';
import { localizedStateName, marketingStateForVisitor } from '@/lib/marketing-states';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { TIERS, tierPackagePriceCents, type TierSlug } from '@/lib/pricing';
import { floridaOnlyNote, type StateCode } from '@/lib/formation-states';
import { JsonLd, pricingProductJsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { withLocaleMeta } from '@/lib/locale-seo';
import { formatCurrency } from '@/lib/utils';

const FL_LLC_FROM = formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL'));

interface PricingPageProps {
  searchParams?: { state?: string | string[] };
}

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function generateMetadata({
  searchParams,
}: PricingPageProps): Promise<Metadata> {
  const explicitState = pickFirst(searchParams?.state);
  const preferred = cookies().get('preferred_state')?.value;
  const { state } = marketingStateForVisitor(explicitState ?? preferred);
  // Self-canonical avoids duplicate-content signals from `?state=` query
  // permutations. Florida, including a Wyoming or Delaware fallback, stays on
  // the bare `/pricing` URL.
  const locale = await getLocale();
  const canonical =
    state.code === 'FL' ? '/pricing' : `/pricing?state=${state.code}`;
  const t = locale === 'es' ? await getTranslations('pricingMeta') : null;
  const title = t
    ? state.code === 'FL'
      ? t('titleFl')
      : t('titleState', { state: state.name })
    : state.code === 'FL'
      ? 'LLC & Corporation Formation Pricing - All-In, No Hidden Fees'
      : `${state.name} LLC & Corporation Formation Pricing - All-In Packages`;
  const description = t
    ? state.code === 'FL'
      ? t('descFl')
      : t('descState', { state: state.name })
    : state.code === 'FL'
      ? `Florida LLC and Corporation formation packages from ${FL_LLC_FROM} all-in. State filing fee included, free Year-1 Registered Agent, Operating Agreement options - no surprise checkout fees.`
      : `${state.name} LLC and Corporation formation pricing with the ${state.name} filing fee included. Free Year-1 Registered Agent, transparent all-in pricing, no upsell tricks.`;
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

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const t = await getTranslations('pricing');
  const locale = await getLocale();
  const explicitState = pickFirst(searchParams?.state);
  const preferred = cookies().get('preferred_state')?.value;
  const resolved = marketingStateForVisitor(explicitState ?? preferred);
  const state = resolved.state;
  const stateNote = resolved.fellBackFromInactive ? floridaOnlyNote(locale) : null;
  const faqItems = getMarketingFaq(state, locale);
  const stateName = localizedStateName(state, locale);

  // Build pricing schema from the live tier catalog so search rich
  // results never drift away from what we actually charge.
  const stateCode = state.code as StateCode;
  const tiersForSchema = TIERS.map((tier) => ({
    name: tier.name,
    priceCents: tierPackagePriceCents(
      tier.slug as TierSlug,
      'LLC',
      stateCode,
    ),
    description: tier.description,
  }));

  return (
    <>
      <JsonLd
        data={pricingProductJsonLd({
          stateName: state.name,
          tiers: tiersForSchema,
        })}
      />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <section className="pt-16 pb-8">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t('kicker')}
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            {state.availability === 'active'
              ? t('pageHeadline', { state: stateName })
              : t('headline')}
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">{t('subhead')}</p>
          {stateNote ? (
            <p role="status" className="mt-4 text-sm text-ink-muted">
              {stateNote}
            </p>
          ) : null}
        </div>
      </section>
      <PricingTable
        showHeader={false}
        state={state}
        feeNote={state.code === 'FL' ? t('floridaBundledStateFees') : undefined}
        feeNoteLink={
          state.code === 'FL' && locale === 'en'
            ? { href: '/guides/florida-llc-cost', label: 'What the state charges' }
            : undefined
        }
      />
      <ComparisonTable />
      <FAQSection state={state} suppressJsonLd />
      <CTABanner state={state} />
    </>
  );
}
