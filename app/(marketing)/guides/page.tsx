import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { localizedHref } from '@/lib/locale-paths';
import { withLocaleMeta } from '@/lib/locale-seo';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guidesPage');
    return withLocaleMeta(
      '/guides',
      {
        title: t('metaTitle'),
        description: t('metaDescription'),
        openGraph: { title: t('ogTitle'), description: t('ogDescription'), type: 'website' },
      },
      locale,
    );
  }
  return withLocaleMeta(
    '/guides',
    {
      title: 'Guides - LLC, Corporation & Compliance Resources',
      description:
        'Plain-English guides to forming a Florida LLC, the annual report, registered agents, operating agreements, Wyoming vs. Delaware, and the 2026 FinCEN BOI update.',
      openGraph: {
        title: 'LaunchForma Guides',
        description:
          'Plain-English guides to forming a Florida LLC, annual reports, registered agents, operating agreements, and Wyoming vs. Delaware.',
        type: 'website',
      },
    },
    locale,
  );
}

const GUIDES = [
  {
    slug: 'how-to-form-an-llc-in-florida',
    title: 'How to Form an LLC in Florida',
    description:
      'The steps to form a Florida LLC, the state fees from the Division of Corporations, and what to do after your Articles are filed.',
    readingMinutes: 7,
  },
  {
    slug: 'florida-annual-report',
    title: 'Florida Annual Report: Deadline, Fees, and How to File',
    description:
      'When the Florida annual report is due, what it costs for LLCs and corporations, and what happens if you file after May 1.',
    readingMinutes: 5,
  },
  {
    slug: 'florida-registered-agent',
    title: 'What Is a Registered Agent in Florida?',
    description:
      'Who can serve, the Florida street-address rule, and what the state charges to appoint or change your agent.',
    readingMinutes: 5,
  },
  {
    slug: 'florida-llc-operating-agreement',
    title: 'Florida LLC Operating Agreement: Why You Need One',
    description:
      'What an operating agreement does, why Florida banks ask for it, and what to include - even for a single-member LLC.',
    readingMinutes: 9,
  },
  {
    slug: 'wyoming-llc-vs-delaware-corp',
    title: 'Wyoming LLC vs. Delaware Corporation',
    description:
      'Privacy, taxes, fees, and investor expectations compared - so you pick the right home state for your entity.',
    readingMinutes: 10,
  },
  {
    slug: 'boi-filing-2026',
    title: 'BOI Reporting Update 2026',
    description:
      'U.S.-formed companies are exempt from FinCEN beneficial ownership reporting under the August 2026 final rule.',
    readingMinutes: 4,
  },
];

export default async function GuidesHubPage() {
  const locale = await getLocale();
  const t = locale === 'es' ? await getTranslations('guidesPage') : null;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  const prefix = locale === 'es' ? '/es' : '';
  const guides = t
    ? [
        {
          slug: 'how-to-form-an-llc-in-florida',
          title: t('formTitle'),
          description: t('formDescription'),
          readingMinutes: 7,
        },
        {
          slug: 'florida-annual-report',
          title: t('arTitle'),
          description: t('arDescription'),
          readingMinutes: 5,
        },
        {
          slug: 'florida-registered-agent',
          title: t('raTitle'),
          description: t('raDescription'),
          readingMinutes: 5,
        },
        {
          slug: 'florida-llc-operating-agreement',
          title: t('oaTitle'),
          description: t('oaDescription'),
          readingMinutes: 9,
        },
        {
          slug: 'wyoming-llc-vs-delaware-corp',
          title: t('wyTitle'),
          description: t('wyDescription'),
          readingMinutes: 10,
        },
      ]
    : GUIDES;
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: t ? t('listName') : 'LaunchForma Guides',
          itemListElement: guides.map((g, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${baseUrl}${prefix}/guides/${g.slug}`,
            name: g.title,
          })),
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t ? t('home') : 'Home', url: locale === 'es' ? `${baseUrl}/es` : baseUrl },
          { name: t ? t('guides') : 'Guides', url: `${baseUrl}${prefix}/guides` },
        ])}
      />
      <section className="container py-16 md:py-24">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl md:text-5xl font-medium text-ink">{t ? t('title') : 'Guides'}</h1>
          <p className="mt-4 text-lg text-ink-muted">
            {t
              ? t('intro')
              : 'Plain-English answers to the questions founders actually ask - written by the LaunchForma compliance team.'}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {guides.map((g) => (
            <Link
              key={g.slug}
              href={localizedHref(`/guides/${g.slug}`, locale)}
              className="group rounded-2xl border border-border bg-white p-6 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                {t ? t('minRead', { minutes: g.readingMinutes }) : `${g.readingMinutes} min read`}
              </p>
              <h2 className="mt-2 font-display text-xl font-medium text-ink leading-snug">
                {g.title}
              </h2>
              <p className="mt-2 text-sm text-ink-muted leading-relaxed">{g.description}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                {t ? t('read') : 'Read guide'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
