import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { permanentRedirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { isSpanishPublicPath, PUBLIC_PATH_HEADER, toSpanishUrl } from '@/lib/locale-paths';
import { pageTitle } from '@/lib/seo-title';

/**
 * Spanish-only guide. The English path 308-redirects here so the sitemap
 * lists one URL. hreflang es and x-default both point at /es/guides/<slug>
 * because there is no English article to pair.
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
): Promise<Metadata> {
  redirectUnlessSpanish(englishPath);
  const t = await getTranslations(namespace);
  const esPath = toSpanishUrl(englishPath);
  return {
    title: pageTitle(t('metaTitle')),
    description: t('metaDescription'),
    alternates: {
      canonical: esPath,
      languages: {
        es: esPath,
        'x-default': esPath,
      },
    },
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
}: {
  path: string;
  namespace: string;
  slug: string;
  readingMinutes: number;
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
        cta={{
          headline: t('ctaHeadline'),
          subhead: t('ctaSubhead'),
          href: '/start',
          label: t('ctaLabel'),
        }}
      >
        <MarkdownBody markdown={t('body')} locale="es" />
        <p className="not-prose text-xs text-ink-subtle mt-8">{t('disclaimer')}</p>
      </GuideLayout>
    </>
  );
}
