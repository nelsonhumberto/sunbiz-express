import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { permanentRedirect } from 'next/navigation';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { GuidePriceBlock } from '@/components/marketing/GuidePriceBlock';
import { GuideScrollDepth, GuideTrackedCta } from '@/components/marketing/GuideCtaTracking';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { buyerTwinAlternates } from '@/lib/buyer-guide-hreflang';
import { englishOnlyAlternates } from '@/lib/locale-seo';
import { pageTitle } from '@/lib/seo-title';

const HERO_CLASS =
  'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover';
const REPEAT_CLASS =
  'inline-flex items-center gap-2 mt-4 bg-primary text-white px-5 py-2.5 rounded-md font-semibold hover:bg-primary-hover transition-colors';

export const BUYER_CTA_LABEL = 'Start your Florida LLC';

type Faq = { q: string; a: string };

export async function englishBuyerMetadata(input: {
  path: string;
  title: string;
  description: string;
  published: string;
  /** Spanish article with a different slug. Omitted when no Spanish page exists yet. */
  esTwin?: string;
}): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') permanentRedirect(input.esTwin ?? input.path);
  return {
    title: pageTitle(input.title),
    description: input.description,
    alternates: input.esTwin
      ? buyerTwinAlternates(input.path, input.esTwin)
      : englishOnlyAlternates(input.path),
    robots: { index: true, follow: true },
    openGraph: {
      title: input.title,
      description: input.description,
      type: 'article',
      locale: 'en_US',
      publishedTime: input.published,
    },
  };
}

export async function EnglishBuyerGuide({
  slug,
  title,
  description,
  published,
  readingMinutes,
  trackSource,
  markdown,
  faq,
  disclaimer,
}: {
  slug: string;
  title: string;
  description: string;
  published: string;
  readingMinutes: number;
  trackSource: string;
  markdown: string;
  faq: Faq[];
  disclaimer: string;
}) {
  const locale = await getLocale();
  return (
    <>
      <GuideScrollDepth source={trackSource} />
      <JsonLd data={faqPageJsonLd(faq)} />
      <GuideLayout
        slug={slug}
        title={title}
        description={description}
        datePublished={published}
        inLanguage={locale === 'es' ? 'es' : 'en'}
        readingMinutes={readingMinutes}
      >
        <GuidePriceBlock />
        <p className="not-prose my-6">
          <GuideTrackedCta
            href={locale === 'es' ? '/es/start' : '/start'}
            label={BUYER_CTA_LABEL}
            className={HERO_CLASS}
            location="hero"
            source={trackSource}
          />
        </p>
        <MarkdownBody markdown={markdown} locale={locale === 'es' ? 'es' : 'en'} />
        <h2>FAQ</h2>
        {faq.map((item) => (
          <div key={item.q}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
        <div className="not-prose mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <h3 className="font-display text-xl font-medium">Ready to file?</h3>
          <p className="mt-1 text-sm text-ink-muted">
            We submit your filing within 1 business day. Approval timing is up to the state.
          </p>
          <GuideTrackedCta
            href={locale === 'es' ? '/es/start' : '/start'}
            label={BUYER_CTA_LABEL}
            className={REPEAT_CLASS}
            location="repeat"
            source={trackSource}
          />
        </div>
        <p className="not-prose text-xs text-ink-subtle mt-8">{disclaimer}</p>
      </GuideLayout>
    </>
  );
}
