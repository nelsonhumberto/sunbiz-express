import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ArrowRight, BookOpen, CalendarDays } from 'lucide-react';
import { CTABanner } from '@/components/marketing/CTABanner';
import { GuideScrollDepth, GuideTrackedCta } from '@/components/marketing/GuideTracking';
import { JsonLd, articleJsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { localizedHref } from '@/lib/locale-paths';

type GuideCtaTrack = {
  /** `hero` on the first button, `repeat` on the closing button. */
  location?: 'hero' | 'repeat';
  /** Public page path sent with `cta_clicked` and `scroll_depth`. */
  source?: string;
};

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

interface GuideLayoutProps {
  slug: string;
  title: string;
  description: string;
  /** ISO date for the article schema. */
  datePublished: string;
  dateModified?: string;
  /** Reading-time estimate shown in the byline strip. */
  readingMinutes: number;
  children: React.ReactNode;
  /** Rendered after the opening paragraph and before the top CTA. */
  afterLead?: React.ReactNode;
  /** Optional CTA card text at the foot of the guide. */
  cta?: { headline: string; subhead: string; href: string; label: string } & GuideCtaTrack;
  /** Compact CTA rendered under the title, before the body. */
  topCta?: { href: string; label: string } & GuideCtaTrack;
  /** BCP 47 language for Article JSON-LD. Omitted on guides that do not set it. */
  inLanguage?: string;
}

/**
 * Shared chrome for cornerstone SEO guide pages. Includes Article +
 * BreadcrumbList JSON-LD and the prose/typography that the audit asked
 * for. New guides only have to author their body content.
 */
export async function GuideLayout({
  slug,
  title,
  description,
  datePublished,
  dateModified,
  readingMinutes,
  children,
  afterLead,
  cta,
  topCta,
  inLanguage,
}: GuideLayoutProps) {
  const locale = await getLocale();
  const t = await getTranslations('guidesChrome');
  const prefix = locale === 'es' ? '/es' : '';
  const trackSource = topCta?.source || cta?.source;
  const topClass =
    'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover';
  const bottomClass =
    'inline-flex items-center gap-2 mt-4 bg-primary text-white px-5 py-2.5 rounded-md font-semibold hover:bg-primary-hover transition-colors';
  const url = `${BASE_URL}${prefix}/guides/${slug}`;
  const homeUrl = locale === 'es' ? `${BASE_URL}/es` : BASE_URL;
  const guidesUrl = `${BASE_URL}${prefix}/guides`;
  return (
    <>
      {trackSource ? <GuideScrollDepth source={trackSource} /> : null}
      <JsonLd
        data={articleJsonLd({
          headline: title,
          description,
          url,
          datePublished,
          dateModified,
          inLanguage,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t('home'), url: homeUrl },
          { name: t('guides'), url: guidesUrl },
          { name: title, url },
        ])}
      />

      <article className="container max-w-3xl py-12 md:py-16 prose prose-sm md:prose-base prose-headings:font-display prose-headings:tracking-tight prose-h1:text-4xl md:prose-h1:text-5xl prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-lg prose-p:text-ink-muted prose-strong:text-ink prose-a:text-primary prose-a:break-words prose-a:[overflow-wrap:anywhere] [&_a]:break-words [&_a]:[overflow-wrap:anywhere] prose-li:text-ink-muted">
        <p className="not-prose flex flex-wrap items-center gap-4 text-xs uppercase tracking-wider text-ink-subtle mb-3">
          <Link
            href={localizedHref('/states', locale)}
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {t('kicker')}
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Date(dateModified ?? datePublished).toLocaleDateString(locale === 'es' ? 'es' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          <span>· {t('minRead', { minutes: readingMinutes })}</span>
        </p>
        <h1>{title}</h1>
        <p className="lead text-lg text-ink-muted">{description}</p>
        {afterLead}
        {topCta ? (
          <p className="not-prose mt-4 mb-2">
            {topCta.source ? (
              <GuideTrackedCta
                href={localizedHref(topCta.href, locale)}
                label={topCta.label}
                className={topClass}
                location={topCta.location ?? 'hero'}
                source={topCta.source}
              />
            ) : (
              <Link
                href={localizedHref(topCta.href, locale)}
                className={topClass}
              >
                {topCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </p>
        ) : null}
        {children}

        {cta && (
          <div className="not-prose mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <h3 className="font-display text-xl font-medium">{cta.headline}</h3>
            <p className="mt-1 text-sm text-ink-muted">{cta.subhead}</p>
            {cta.source ? (
              <GuideTrackedCta
                href={localizedHref(cta.href, locale)}
                label={cta.label}
                className={bottomClass}
                location={cta.location ?? 'repeat'}
                source={cta.source}
              />
            ) : (
              <Link
                href={localizedHref(cta.href, locale)}
                className={bottomClass}
              >
                {cta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
      </article>

      <CTABanner />
    </>
  );
}
