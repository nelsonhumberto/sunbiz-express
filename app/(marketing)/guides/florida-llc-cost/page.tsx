import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { permanentRedirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { englishOnlyAlternates } from '@/lib/locale-seo';

const PUBLISHED = '2026-10-26';
const DATE_MODIFIED = '2026-10-26';
const PATH = '/guides/florida-llc-cost';
const SLUG = 'florida-llc-cost';

const TITLE = 'Florida LLC Cost 2026: $125 State Fee and Yearly Costs';
const H1 = 'How Much Does It Cost to Start an LLC in Florida? (2026 State Fees)';
const DESCRIPTION =
  'Forming a Florida LLC costs $125 in state fees, and the annual report is $138.75 each year. See every Sunbiz fee, what is free, and the costs owners forget.';

const FAQ_HREFS: Record<string, string> = {
  'https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/':
    'https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/',
  'https://launchforma.com/guides/florida-annual-report': '/guides/florida-annual-report',
  'https://launchforma.com/guides/florida-llc-operating-agreement':
    '/guides/florida-llc-operating-agreement',
};

const FAQ = [
  {
    q: 'Is the $125 a one-time fee?',
    a: 'Yes, the $125 formation fee is paid once. The $138.75 annual report is paid every year.',
  },
  {
    q: 'When is my first annual report due?',
    a: "Between January 1 and May 1 of the year after your LLC is formed. The state's annual report page explains the late fee: https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/ . See also https://launchforma.com/guides/florida-annual-report",
  },
  {
    q: 'Do I need an operating agreement?',
    a: 'Florida does not file one with the state, but having one is a good idea. See https://launchforma.com/guides/florida-llc-operating-agreement',
  },
];

const SHORT = `*General information only, not legal or tax advice.*

## Short answer

The state of Florida charges **$125** to form a new LLC: a $100 filing fee plus a $25 registered agent designation fee, paid when you file the Articles of Organization. After that, every Florida LLC files an annual report each year for **$138.75**, due between January 1 and May 1.

Source: Florida Division of Corporations, LLC Fees, [https://dos.fl.gov/sunbiz/forms/fees/llc-fees/](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/)`;

const BODY = `## Florida LLC state fees at a glance

| Item | State fee | Required? |
|---|---|---|
| Articles of Organization filing fee | $100.00 | Yes |
| Registered agent designation fee | $25.00 | Yes |
| **Total to form a new Florida LLC** | **$125.00** | Yes |
| Certified copy of record | $30.00 | Optional |
| Certificate of status | $5.00 | Optional |
| Name reservation | $25.00 | Optional |
| Annual report (January 1 to May 1) | $138.75 | Yes, every year after the year you form |
| Annual report received after May 1 | $538.75 | Only if late |
| Change of registered agent | $25.00 | Only if you change agents |
| Any other amendment | $25.00 | Only if you amend |
| Reinstatement (after administrative dissolution) | $100.00 plus each missed year's annual report fee | Only if dissolved |

Source for every row: [https://dos.fl.gov/sunbiz/forms/fees/llc-fees/](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/)

## What is free

- **EIN (Employer Identification Number).** The IRS issues EINs for free. In the IRS's own words: "You never have to pay a fee for an EIN." The IRS also says to form your LLC with the state first, then apply. Source: [https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number](https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number)
- **BOI report.** As of the August 2026 FinCEN final rule, U.S.-formed companies are exempt from beneficial ownership reporting. See [https://launchforma.com/boi-reporting](/boi-reporting)

## Costs people forget

1. **The annual report.** It is due every year between January 1 and May 1, starting the year after you form. The state fee jumps from $138.75 to $538.75 if it arrives after May 1 (source above). Missing it entirely can lead to administrative dissolution, and reinstating costs $100 plus every missed annual report fee.
2. **Registered agent service.** Every Florida LLC must list a registered agent with a Florida street address. You can serve as your own agent if you have a Florida street address and are available during business hours. Many owners pay a service instead so their home address stays off public records. See [https://launchforma.com/guides/florida-registered-agent](/guides/florida-registered-agent)
3. **Fictitious name (DBA).** If you will operate under a name other than your exact LLC name, Florida charges $50 to register a fictitious name. Source: [https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/](https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/)
4. **Local business tax receipt.** Most Florida cities and counties require a local business tax receipt. Fees vary by city, county and business type, so check with your city and county tax collector.
5. **Professional licenses.** Some trades (for example cosmetology, barbering and construction) also need a state license from the Florida Department of Business and Professional Regulation. That is separate from forming the LLC.

## Florida LLC vs. Florida corporation: state filing fees

| | LLC | Corporation |
|---|---|---|
| Formation (filing plus registered agent) | $125.00 ($100 + $25) | $70.00 ($35 + $35) |
| Annual report (on time) | $138.75 | $150.00 |

Sources: [https://dos.fl.gov/sunbiz/forms/fees/llc-fees/](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/) and [https://dos.fl.gov/sunbiz/forms/fees/corporate-fees/](https://dos.fl.gov/sunbiz/forms/fees/corporate-fees/)

Which structure fits depends on taxes and goals, so talk to a CPA or attorney before choosing. See also [https://launchforma.com/guides/how-to-form-a-florida-corporation](/guides/how-to-form-a-florida-corporation)

## DIY or use a filing service?

You can file directly on Sunbiz for the $125 state fee. Owners usually use a service when they want someone to check the name and paperwork, act as registered agent, track the annual report deadline, or answer questions in English or Spanish.

LaunchForma is a husband and wife team that has been helping business owners since 2015, from our office in Miami Lakes. Our packages include the state filing fee, so there is no separate state fee to add at checkout, and we file within 1 business day. Approval timing is up to the state. Current packages are on [https://launchforma.com/pricing](/pricing)`;

const CLOSING = `## Ready to start?

Start your Florida LLC online, no account needed: **[https://launchforma.com/start](/start)**`;

const DISCLAIMER = `Disclaimer: LaunchForma is not a law firm and does not provide legal or tax advice. State fees change; always confirm on [dos.fl.gov](https://dos.fl.gov) before filing.`;

function StartButton() {
  return (
    <p className="not-prose my-6">
      <Link
        href="/start"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
      >
        Start your Florida LLC online, no account needed
        <ArrowRight className="h-4 w-4" />
      </Link>
    </p>
  );
}

function LinkedAnswer({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s]+)/g);
  return (
    <p>
      {parts.map((part, index) => {
        const href = FAQ_HREFS[part];
        if (!href) return part;
        const external = href.startsWith('http');
        return (
          <a
            key={`${part}-${index}`}
            href={href}
            className="break-words [overflow-wrap:anywhere]"
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {part}
          </a>
        );
      })}
    </p>
  );
}

function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.q}>
          <h3>{item.q}</h3>
          <LinkedAnswer text={item.a} />
        </div>
      ))}
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  // No Spanish article yet. /es rewrites onto this page, so send it back
  // to the English URL instead of publishing an es hreflang.
  if (locale === 'es') permanentRedirect(PATH);
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: englishOnlyAlternates(PATH),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      type: 'article',
      locale: 'en_US',
      publishedTime: PUBLISHED,
      modifiedTime: `${DATE_MODIFIED}T00:00:00.000Z`,
    },
  };
}

export default async function FloridaLlcCostGuide() {
  const locale = await getLocale();
  if (locale === 'es') permanentRedirect(PATH);
  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ)} />
      <GuideLayout
        slug={SLUG}
        title={H1}
        description={DESCRIPTION}
        datePublished={PUBLISHED}
        dateModified={DATE_MODIFIED}
        inLanguage="en"
        readingMinutes={5}
      >
        <MarkdownBody markdown={SHORT} locale="en" />
        <StartButton />
        <MarkdownBody markdown={BODY} locale="en" />
        <h2>FAQ</h2>
        <FaqList items={FAQ} />
        <MarkdownBody markdown={CLOSING} locale="en" />
        <StartButton />
        <MarkdownBody markdown={DISCLAIMER} locale="en" />
      </GuideLayout>
    </>
  );
}
