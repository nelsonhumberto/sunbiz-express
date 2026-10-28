import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { GuideValueBlock } from '@/components/marketing/GuideValueBlock';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { isSpanishPublicPath, PUBLIC_PATH_HEADER, toSpanishUrl } from '@/lib/locale-paths';
import { guideTwinAlternates, spanishOnlyAlternates } from '@/lib/locale-seo';
import { pageTitle } from '@/lib/seo-title';

type SpanishGuideMetaOptions = {
  /** English article with a different slug. hreflang points there instead of omitting `en`. */
  twinEnglishPath?: string;
  /** Explicit index, follow. Spanish guides are indexable either way. */
  indexable?: boolean;
};

/**
 * Spanish-only guide. The English path 308-redirects here so the sitemap
 * lists one URL. hreflang is es and x-default only. Do not add en: it would
 * point at that redirect.
 */
function redirectUnlessSpanish(englishPath: string) {
  const requestPath = headers().get(PUBLIC_PATH_HEADER) ?? '';
  if (!isSpanishPublicPath(requestPath)) {
    permanentRedirect(toSpanishUrl(englishPath));
  }
}

export async function spanishGuideMetadata(
  englishPath: string,
  namespace: string,
  options?: SpanishGuideMetaOptions,
): Promise<Metadata> {
  redirectUnlessSpanish(englishPath);
  const t = await getTranslations(namespace);
  const esPath = toSpanishUrl(englishPath);
  const alternates = options?.twinEnglishPath
    ? guideTwinAlternates(options.twinEnglishPath, esPath)
    : spanishOnlyAlternates(esPath);
  return {
    title: pageTitle(t('metaTitle')),
    description: t('metaDescription'),
    alternates,
    ...(options?.indexable ? { robots: { index: true, follow: true } } : {}),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      type: 'article',
      locale: 'es_US',
      publishedTime: t('published'),
    },
  };
}

export async function SpanishGuide({
  path,
  namespace,
  slug,
  readingMinutes,
  showValue = false,
  trackSource,
}: {
  path: string;
  namespace: string;
  slug: string;
  readingMinutes: number;
  /** Essential Florida LLC price, read from the pricing catalog. */
  showValue?: boolean;
  /** Public /es path for cta_clicked and scroll_depth. */
  trackSource?: string;
}) {
  redirectUnlessSpanish(path);
  const t = await getTranslations(namespace);
  const faqCount = Number(t('faqCount'));
  const faq = Array.from({ length: faqCount }, (_, i) => {
    const n = i + 1;
    return { q: t(`faq${n}q`), a: t(`faq${n}a`) };
  });
  return (
    <>
      <JsonLd data={faqPageJsonLd(faq)} />
      <GuideLayout
        slug={slug}
        title={t('title')}
        description={t('description')}
        datePublished={t('published')}
        readingMinutes={readingMinutes}
        topCta={{
          href: '/start',
          label: t('ctaLabel'),
          location: 'hero',
          source: trackSource,
        }}
        cta={{
          headline: t('ctaHeadline'),
          subhead: t('ctaSubhead'),
          href: '/start',
          label: t('ctaLabel'),
          location: 'repeat',
          source: trackSource,
        }}
        afterLead={showValue ? <GuideValueBlock /> : null}
      >
        <MarkdownBody markdown={t('body')} locale="es" />
        <p className="not-prose text-xs text-ink-subtle mt-8">{t('disclaimer')}</p>
      </GuideLayout>
    </>
  );
}
