import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Guides — LLC, Corporation & Compliance Resources',
  description:
    'Plain-English guides to forming and running a business: operating agreements, Wyoming vs. Delaware, and the 2026 FinCEN BOI report.',
  alternates: { canonical: '/guides' },
  openGraph: {
    title: 'LaunchForma Guides',
    description:
      'Plain-English guides to forming and running a business — operating agreements, Wyoming vs. Delaware, and BOI filing.',
    type: 'website',
  },
};

const GUIDES = [
  {
    slug: 'florida-llc-operating-agreement',
    title: 'Florida LLC Operating Agreement: Why You Need One',
    description:
      'What an operating agreement does, why Florida banks ask for it, and what to include — even for a single-member LLC.',
    readingMinutes: 9,
  },
  {
    slug: 'wyoming-llc-vs-delaware-corp',
    title: 'Wyoming LLC vs. Delaware Corporation',
    description:
      'Privacy, taxes, fees, and investor expectations compared — so you pick the right home state for your entity.',
    readingMinutes: 10,
  },
  {
    slug: 'boi-filing-2026',
    title: 'BOI Filing 2026: What Every LLC and Corporation Must Know',
    description:
      'The FinCEN Beneficial Ownership Information report under the Corporate Transparency Act — deadlines, exemptions, and penalties.',
    readingMinutes: 11,
  },
];

export default function GuidesHubPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'LaunchForma Guides',
          itemListElement: GUIDES.map((g, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${baseUrl}/guides/${g.slug}`,
            name: g.title,
          })),
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: baseUrl },
          { name: 'Guides', url: `${baseUrl}/guides` },
        ])}
      />
      <section className="container py-16 md:py-24">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl md:text-5xl font-medium text-ink">Guides</h1>
          <p className="mt-4 text-lg text-ink-muted">
            Plain-English answers to the questions founders actually ask — written by the
            LaunchForma compliance team.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/guides/${g.slug}`}
              className="group rounded-2xl border border-border bg-white p-6 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-ink-subtle">
                {g.readingMinutes} min read
              </p>
              <h2 className="mt-2 font-display text-xl font-medium text-ink leading-snug">
                {g.title}
              </h2>
              <p className="mt-2 text-sm text-ink-muted leading-relaxed">{g.description}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Read guide
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
