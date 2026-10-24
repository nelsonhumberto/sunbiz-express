import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { OaTemplateDownload } from '@/components/marketing/OaTemplateDownload';
import { JsonLd, faqPageJsonLd, webPageJsonLd } from '@/components/seo/JsonLd';
import {
  OA_GUIDE_EN,
  OA_GUIDE_MODIFIED,
  OA_GUIDE_PATH,
  OA_GUIDE_PUBLISHED,
  POPULAR_START_HREF,
  oaGuideLead,
  type OaGuideCopy,
} from '@/lib/oa-guide-copy';
import { localizedHref } from '@/lib/locale-paths';
import { withLocaleMeta } from '@/lib/locale-seo';
import { oaTemplateDownloadEnabled } from '@/lib/oa-template';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

async function spanishCopy(): Promise<OaGuideCopy> {
  const t = await getTranslations('guideOa');
  return {
    metaTitle: t('metaTitle'),
    metaDescription: t('metaDescription'),
    h1: t('title'),
    lead: t('description'),
    downloadLead: t('downloadLead'),
    body: t('body'),
    related: t('related'),
    ctaHeading: t('ctaHeading'),
    ctaBody: t('ctaBody'),
    ctaStart: t('ctaStart'),
    ctaPricing: t('ctaPricing'),
    disclaimer: t('disclaimer'),
    faqHeading: t('faqHeading'),
    faq: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) })),
    download: {
      heading: t('downloadHeading'),
      subhead: t('downloadSubhead'),
      emailLabel: t('downloadEmail'),
      consentBefore: t('downloadConsentBefore'),
      privacyLabel: t('downloadPrivacy'),
      privacyHref: '/privacy',
      consentText: t('downloadConsentText'),
      button: t('downloadButton'),
      success: t('downloadSuccess'),
      note: t('downloadNote'),
      comingSoon: t('downloadComingSoon'),
      sampleHeader: t('downloadSampleHeader'),
      invalidEmail: t('downloadInvalidEmail'),
      consentRequired: t('downloadConsentRequired'),
      genericError: t('downloadGenericError'),
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = locale === 'es' ? await spanishCopy() : OA_GUIDE_EN;
  return withLocaleMeta(
    OA_GUIDE_PATH,
    {
      title: { absolute: copy.metaTitle },
      description: copy.metaDescription,
      openGraph: {
        title: copy.metaTitle,
        description: copy.metaDescription,
        type: 'article',
        publishedTime: OA_GUIDE_PUBLISHED,
        modifiedTime: `${OA_GUIDE_MODIFIED}T00:00:00.000Z`,
      },
    },
    locale,
  );
}

function GuideBody({
  copy,
  locale,
  downloadEnabled,
}: {
  copy: OaGuideCopy;
  locale: 'en' | 'es';
  downloadEnabled: boolean;
}) {
  const startHref = localizedHref(POPULAR_START_HREF, locale);
  const pricingHref = localizedHref('/pricing', locale);
  return (
    <>
      <MarkdownBody markdown={copy.body} locale={locale} />
      <OaTemplateDownload enabled={downloadEnabled} locale={locale} copy={copy.download} />
      <h2>{copy.ctaHeading}</h2>
      <p>{copy.ctaBody}</p>
      <p>
        <Link href={startHref}>{copy.ctaStart}</Link>
        {' · '}
        <Link href={pricingHref}>{copy.ctaPricing}</Link>
      </p>
      <h2>{copy.faqHeading}</h2>
      {copy.faq.map((item) => (
        <div key={item.q}>
          <p>
            <strong>{item.q}</strong>
          </p>
          <p>{item.a}</p>
        </div>
      ))}
      <MarkdownBody markdown={copy.related} locale={locale} />
      <p className="not-prose text-xs text-ink-subtle mt-8">{copy.disclaimer}</p>
    </>
  );
}

export default async function FloridaOperatingAgreementGuide() {
  noStore();
  const locale = await getLocale();
  const lang = locale === 'es' ? 'es' : 'en';
  const copy = lang === 'es' ? await spanishCopy() : OA_GUIDE_EN;
  const downloadEnabled = oaTemplateDownloadEnabled();
  const lead = oaGuideLead(copy);
  const pageUrl = `${BASE_URL}${lang === 'es' ? '/es' : ''}${OA_GUIDE_PATH}`;

  return (
    <>
      <JsonLd data={faqPageJsonLd(copy.faq, lang === 'es' ? { inLanguage: 'es' } : undefined)} />
      <JsonLd
        data={webPageJsonLd({
          name: copy.h1,
          description: copy.metaDescription,
          url: pageUrl,
          inLanguage: lang,
          dateModified: OA_GUIDE_MODIFIED,
        })}
      />
      <GuideLayout
        slug="florida-llc-operating-agreement"
        title={copy.h1}
        description={lead}
        datePublished={OA_GUIDE_PUBLISHED}
        dateModified={OA_GUIDE_MODIFIED}
        inLanguage={lang}
        readingMinutes={12}
        topCta={{ href: POPULAR_START_HREF, label: copy.ctaStart }}
      >
        <GuideBody copy={copy} locale={lang} downloadEnabled={downloadEnabled} />
      </GuideLayout>
    </>
  );
}
