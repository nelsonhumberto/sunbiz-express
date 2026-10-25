import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { EnEspanolLinks } from '@/components/marketing/EnEspanolLinks';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { EN_FORM_LLC_SPANISH_LINKS } from '@/lib/spanish-guide-links';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { withBrand } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';

const PUBLISHED = '2026-10-23';
const TITLE = 'How to Form an LLC in Florida (2026 Guide)';
const H1 = 'How to Form an LLC in Florida';
const DESCRIPTION =
  'The steps to form a Florida LLC, the state fees from the Florida Division of Corporations, and what to do after your Articles are filed.';

const FAQ = [
  {
    q: 'How do you form an LLC in Florida?',
    a: 'Choose a distinguishable name that includes Limited Liability Company, LLC, or L.L.C., appoint a registered agent with a physical Florida street address, file Articles of Organization with the Florida Division of Corporations, and pay the state fees. This is general information, not legal or tax advice.',
  },
  {
    q: 'What are the Florida state fees to form an LLC?',
    a: 'The required minimum is $125.00: a $100.00 Articles of Organization filing fee plus a $25.00 registered agent designation. A certified copy is $30.00 and a certificate of status is $5.00. With both optional documents the total is $160.00.',
  },
  {
    q: 'When is the first Florida annual report due?',
    a: 'The filing window is January 1 to May 1 each year, starting the year after formation.',
  },
];

const PATH = '/guides/how-to-form-an-llc-in-florida';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlForm');
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

export default async function HowToFormFloridaLlcGuide() {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlForm');
    const faq = [1, 2, 3].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
    return (
      <>
        <JsonLd data={faqPageJsonLd(faq)} />
        <GuideLayout
          slug="how-to-form-an-llc-in-florida"
          title={t('title')}
          description={t('description')}
          datePublished={PUBLISHED}
          readingMinutes={7}
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
  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ)} />
      <GuideLayout
        slug="how-to-form-an-llc-in-florida"
        title={H1}
        description="Forming a Florida LLC comes down to a few filings and decisions. This guide walks through each step using the requirements published by the Florida Department of State, Division of Corporations (Sunbiz). It is general information, not legal or tax advice. For your specific situation, talk to an attorney or CPA."
        datePublished={PUBLISHED}
        readingMinutes={7}
        cta={{
          headline: 'Want this filed for you?',
          subhead:
            'LaunchForma prepares and submits the Florida filing. You can also file directly on Sunbiz.',
          href: '/start',
          label: 'Start a Florida LLC',
        }}
      >
        <EnEspanolLinks heading="En español" links={EN_FORM_LLC_SPANISH_LINKS} />
        <h2>Step 1: Choose a name</h2>
        <p>Florida requires that your LLC name:</p>
        <ul>
          <li>Is distinguishable on the records of the Department of State</li>
          <li>
            Includes &quot;Limited Liability Company,&quot; &quot;LLC,&quot; or &quot;L.L.C.&quot;
            (professional LLCs use &quot;PLLC&quot; or similar)
          </li>
        </ul>
        <p>
          Run a preliminary name search on Sunbiz before you file. The state notes you
          should not treat a name as approved until you receive a filing acknowledgment.
        </p>

        <h2>Step 2: Appoint a registered agent</h2>
        <p>
          Every Florida LLC needs a registered agent with a physical street address in
          Florida. A P.O. Box does not qualify. The agent must sign to accept the role.
          An LLC cannot serve as its own agent, but an individual associated with the
          business can, or you can use a commercial registered agent service.
        </p>
        <p>
          See our guide:{' '}
          <a href="/guides/florida-registered-agent">What is a registered agent in Florida?</a>
        </p>

        <h2>Step 3: File Articles of Organization</h2>
        <p>
          You file Articles of Organization with the Division of Corporations, online or
          by mail. The Articles include:
        </p>
        <ul>
          <li>LLC name</li>
          <li>Principal office street address and mailing address</li>
          <li>Registered agent name, address, and signature</li>
          <li>Purpose (required only for professional LLCs)</li>
          <li>
            Managers or authorized representatives (optional, but banks and some agencies
            may want them on record)
          </li>
          <li>Optional effective date</li>
        </ul>

        <h2>Step 4: Pay the state fees</h2>
        <p>Per the Florida Division of Corporations fee schedule:</p>
        <div className="not-prose my-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-3 font-semibold text-ink">Item</th>
                <th className="px-4 py-3 font-semibold text-ink">State fee</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">Articles of Organization filing fee (required)</td>
                <td className="px-4 py-3 text-ink">$100.00</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">Registered agent designation (required)</td>
                <td className="px-4 py-3 text-ink">$25.00</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">Certified copy (optional)</td>
                <td className="px-4 py-3 text-ink">$30.00</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-4 py-3 text-ink-muted">Certificate of status (optional)</td>
                <td className="px-4 py-3 text-ink">$5.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>Required minimum: $125.00. With both optional documents: $160.00.</p>

        <h2>Step 5: After approval</h2>
        <p>Common next steps for many new LLCs:</p>
        <ul>
          <li>Get an EIN from the IRS (the IRS does not charge for an EIN)</li>
          <li>
            Prepare an operating agreement (
            <a href="/guides/florida-llc-operating-agreement">Florida LLC operating agreement guide</a>
            )
          </li>
          <li>Open a business bank account</li>
          <li>Check for any local or state licenses your business needs</li>
          <li>
            Put the annual report on your calendar: due January 1 to May 1 each year,
            starting the year after formation (
            <a href="/guides/florida-annual-report">Florida annual report guide</a>)
          </li>
        </ul>

        <h2>Do it yourself or use a service?</h2>
        <p>
          You can file directly on Sunbiz. A filing service such as LaunchForma prepares
          and submits the filing for you and adds things like registered agent service.
          LaunchForma is a private filing service, not a government agency and not a law
          firm. <a href="/pricing">See pricing</a> or <a href="/start">start a filing</a>.
        </p>
        <p>
          Forming a corporation instead? Read{' '}
          <a href="/guides/how-to-form-a-florida-corporation">how to form a Florida corporation</a>.
        </p>
        <p>
          Selling under a brand name? See{' '}
          <a href="/guides/florida-fictitious-name-dba">Florida fictitious names</a>.
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
            Florida Division of Corporations, Instructions for Articles of Organization:{' '}
            <a
              href="https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/"
              target="_blank"
              rel="noopener noreferrer"
            >
              dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/
            </a>
          </li>
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
          LaunchForma is not a law firm and this guide is not legal or tax advice.
        </p>
      </GuideLayout>
    </>
  );
}
