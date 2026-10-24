import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { EnEspanolLinks } from '@/components/marketing/EnEspanolLinks';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { EN_FLORIDA_LICENSE_SPANISH_LINKS } from '@/lib/spanish-guide-links';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { withBrand } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';

const PUBLISHED = '2026-10-23';
const TITLE = 'Florida Annual Report: Deadline, Fees, and How to File';
const DESCRIPTION =
  'When the Florida annual report is due, what it costs for LLCs and corporations, and what happens if you file after May 1.';

const FAQ = [
  {
    q: 'When is the Florida annual report due?',
    a: 'The filing window is January 1 through May 1. Your first annual report is due in the year after the year you formed.',
  },
  {
    q: 'How much does a Florida annual report cost?',
    a: 'From the Florida Division of Corporations fee schedule, an LLC annual report is $138.75 on time and $538.75 if received after May 1. A for-profit corporation annual report is $150.00 on time and $550.00 if received after May 1. The difference for a late for-profit filing is a $400 late fee.',
  },
  {
    q: 'What happens if you miss the Florida annual report deadline?',
    a: 'The late fee applies to reports received after May 1. Entities that do not file can face administrative dissolution under Florida rules. Check Sunbiz for the current schedule and reinstatement fees, or ask an attorney about your situation.',
  },
];

const PATH = '/guides/florida-annual-report';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlAnnual');
    return withLocaleMeta(
      PATH,
      {
        title: t('metaTitle'),
        description: t('metaDescription'),
        openGraph: {
          title: t('ogTitle'),
          description: t('ogDescription'),
          type: 'article',
          publishedTime: PUBLISHED,
        },
      },
      locale,
    );
  }
  return withLocaleMeta(
    PATH,
    {
      title: TITLE,
      description: DESCRIPTION,
      openGraph: {
        title: withBrand(TITLE),
        description: DESCRIPTION,
        type: 'article',
        publishedTime: PUBLISHED,
      },
    },
    locale,
  );
}

export default async function FloridaAnnualReportGuide() {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlAnnual');
    const faq = [1, 2, 3].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
    return (
      <>
        <JsonLd data={faqPageJsonLd(faq)} />
        <GuideLayout
          slug="florida-annual-report"
          title={t('title')}
          description={t('description')}
          datePublished={PUBLISHED}
          readingMinutes={5}
          cta={{
            headline: t('ctaHeadline'),
            subhead: t('ctaSubhead'),
            href: '/file-annual-report',
            label: t('ctaLabel'),
          }}
        >
          <MarkdownBody markdown={t('body')} locale="es" />
          <p className="not-prose text-xs text-ink-subtle mt-8">{t('disclaimer')}</p>
        </GuideLayout>
      </>
    );
  }
  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ)} />
      <GuideLayout
        slug="florida-annual-report"
        title={TITLE}
        description="Florida LLCs and corporations file an annual report with the Division of Corporations every year to keep their records current. This is general information, not legal advice."
        datePublished={PUBLISHED}
        readingMinutes={5}
        cta={{
          headline: 'File your Florida annual report',
          subhead:
            'LaunchForma files Florida annual reports with no account required.',
          href: '/file-annual-report',
          label: 'File your annual report',
        }}
      >
        <EnEspanolLinks heading="En español" links={EN_FLORIDA_LICENSE_SPANISH_LINKS} />
        <h2>When is it due?</h2>
        <p>
          The filing window is January 1 through May 1. Your first annual report is due
          in the year after the year you formed.
        </p>

        <h2>How much does it cost?</h2>
        <p>From the Florida Division of Corporations fee schedule:</p>
        <div className="not-prose my-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-3 font-semibold text-ink">Entity</th>
                <th className="px-4 py-3 font-semibold text-ink">On time</th>
                <th className="px-4 py-3 font-semibold text-ink">Received after May 1</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">LLC annual report</td>
                <td className="px-4 py-3 text-ink">$138.75</td>
                <td className="px-4 py-3 text-ink">$538.75</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">For-profit corporation annual report</td>
                <td className="px-4 py-3 text-ink">$150.00</td>
                <td className="px-4 py-3 text-ink">$550.00</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">Non-profit corporation annual report</td>
                <td className="px-4 py-3 text-ink">$61.25</td>
                <td className="px-4 py-3 text-ink">Check the Sunbiz fee page</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>The difference for a late for-profit filing is a $400 late fee.</p>

        <h2>What do you need?</h2>
        <ul>
          <li>Your document number (search your company on Sunbiz)</li>
          <li>Current principal and mailing addresses</li>
          <li>Registered agent information</li>
          <li>Names and addresses of managers, authorized representatives, or officers</li>
        </ul>

        <h2>How to file</h2>
        <ol>
          <li>File online on Sunbiz yourself, or</li>
          <li>
            Use a filing service. LaunchForma files Florida annual reports with no account
            required. <a href="/file-annual-report">File your annual report</a>.
          </li>
        </ol>
        <p>
          See <a href="/pricing">formation pricing</a> or <a href="/start">start a filing</a>{' '}
          if you still need to form the company. The steps to form a Florida LLC are in{' '}
          <a href="/guides/how-to-form-an-llc-in-florida">how to form an LLC in Florida</a>.
        </p>

        <h2>What if you miss the deadline?</h2>
        <p>
          The late fee applies to reports received after May 1. Entities that do not file
          can face administrative dissolution under Florida rules; check Sunbiz for the
          current schedule and reinstatement fees, or ask an attorney about your situation.
        </p>

        <h2>Questions</h2>
        {FAQ.map((item) => (
          <div key={item.q}>
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}

        <h2>Sources</h2>
        <ul>
          <li>
            Florida Division of Corporations, Fees:{' '}
            <a
              href="https://dos.fl.gov/sunbiz/forms/fees/"
              target="_blank"
              rel="noopener noreferrer"
            >
              dos.fl.gov/sunbiz/forms/fees/
            </a>
          </li>
        </ul>

        <p className="not-prose text-xs text-ink-subtle mt-8">
          LaunchForma is not a law firm and this guide is not legal advice.
        </p>
      </GuideLayout>
    </>
  );
}
