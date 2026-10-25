import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { permanentRedirect } from 'next/navigation';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { englishOnlyAlternates } from '@/lib/locale-seo';

const PUBLISHED = '2026-10-25';
const DATE_MODIFIED = '2026-10-25';
const PATH = '/guides/florida-fictitious-name-dba';
const SLUG = 'florida-fictitious-name-dba';

const TITLE = 'Florida Fictitious Name (DBA): How to Register in 2026';
const H1 = 'Florida Fictitious Name (DBA): How to Register One';
const DESCRIPTION =
  'How to register a fictitious name (DBA) in Florida: who needs one, the $50 Sunbiz fee, the newspaper ad, 5-year renewal and how to cancel it.';
const LEAD =
  'A fictitious name, often called a DBA ("doing business as"), lets you sell under a brand that is different from your legal name or your company\'s registered name. In Florida you register it with the Division of Corporations on Sunbiz. This guide covers who needs one, what it costs, and how to keep it current.';

const FAQ = [
  {
    q: 'Do I need a DBA if my LLC uses its exact name?',
    a: 'No. If you do business under the exact name on file with Sunbiz, including "LLC", no fictitious name is required (s. 865.09(7)).',
  },
  {
    q: 'How much does a Florida fictitious name cost?',
    a: 'The state fee is $50 to register and $50 to renew every 5 years. A certified copy is $30 and a certificate of status is $10, both optional.',
  },
  {
    q: 'Does registering a fictitious name protect my brand?',
    a: 'No. Florida says registration is public notice only and does not reserve the name. Trademark protection is a separate process.',
  },
  {
    q: 'Do I have to publish a newspaper ad?',
    a: 'Yes. The registration form requires you to certify that the name was advertised at least once in a newspaper in the county of your principal place of business.',
  },
  {
    q: 'How long does a Florida fictitious name last?',
    a: '5 years, ending December 31 of the fifth year. You can renew during the expiration year. An expired name must be registered again.',
  },
  {
    q: 'Can a sole proprietor register a fictitious name?',
    a: 'Yes. Individuals and entities can both register. An LLC or corporation owner must be active on Sunbiz.',
  },
];

const BODY = `*General information, not legal or tax advice. Fees are from the Florida Department of State and can change; confirm on the linked official pages before you file.*

## Who needs a fictitious name in Florida

Under section 865.09 of the Florida Statutes, you need to register if you do business under any name other than your legal name. Common cases:

- A sole proprietor named Maria Lopez who sells as "Sunrise Cakes".
- An LLC registered as "ML Ventures LLC" that sells as "Sunrise Cakes".

You do **not** need one when your LLC or corporation does business under its exact registered name, including "LLC" or "Inc." (s. 865.09(7)).

Source: [Florida Statutes s. 865.09](https://www.flsenate.gov/Laws/Statutes/2025/865.09)

## A fictitious name is not a company

A fictitious name does not create a separate business or protect your personal assets. It is a public notice of who owns a trade name. Florida says registration "does not reserve" the name and gives no ownership rights over it (s. 865.09(8)). If you want a separate legal entity, see [how to form an LLC in Florida](/guides/how-to-form-an-llc-in-florida) or [how to form a Florida corporation](/guides/how-to-form-a-florida-corporation).

The statute also bars words like "Corporation", "Inc.", "LLC" or "Limited Liability Company" in a fictitious name unless the registrant is actually that type of entity (s. 865.09(14)).

## What it costs (official Sunbiz fees)

| Filing | State fee |
|---|---|
| Fictitious name registration | $50 |
| Renewal (every 5 years) | $50 |
| Cancellation or re-registration | $50 |
| Certified copy (optional) | $30 |
| Certificate of status (optional) | $10 |

Sources: [Sunbiz fee schedule](https://dos.fl.gov/sunbiz/forms/fees/), [Fictitious name registration](https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration), s. 865.09(12).

## How to register, step by step

1. **Search the name** on Sunbiz to see what is already on file. Remember: filing does not give you exclusive rights.
2. **Run the newspaper ad.** Before you file, the statute requires you to advertise the name at least once in a newspaper in the county where your principal place of business is, and you certify that on the form (s. 865.09(3)(a)5).
3. **Have your details ready.** If the owner is an LLC or corporation, it must be active on Sunbiz, and you give its Florida document number and FEIN if it has one.
4. **File online** at Sunbiz and pay the $50 fee: [Fictitious Name Registration](https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration).
5. **Keep your local tax receipt in line.** Many cities and counties want your trade name on your local business tax receipt. In Spanish: [Miami-Dade](/es/guides/licencia-negocio-miami-dade) and [Broward](/es/guides/licencia-negocio-broward).

## Renewal: every 5 years

A registration is valid for 5 years and expires on December 31 of the fifth year. You can renew from January 1 to December 31 of the expiration year for $50. The state sends a notice by September 1 of that year. If it expires, it cannot be renewed; you must file a new registration.

Source: [Fictitious Name Renewal](https://dos.fl.gov/sunbiz/manage-business/efile/fictitious-name-renewal)

**Watch for look-alike mail.** The Department of State has warned about private renewal solicitations asking for $125. The official renewal fee is $50. See the [consumer notice](https://dos.fl.gov/sunbiz/about-us/consumer-notices/fic-name-renewal-notices).

## Changing or cancelling

If you stop using the name, the statute says to cancel it within 30 days (s. 865.09(4)). Changes in ownership are handled by cancellation or re-registration ($50).

## What happens if you skip it

A business that does not comply cannot maintain a lawsuit in Florida courts until it registers, and failure to comply is a noncriminal violation (s. 865.09(9)).

## Put your DBA in your Operating Agreement

If an LLC uses a trade name, it helps to note it in the company records. Our [Florida LLC Operating Agreement guide](/guides/florida-llc-operating-agreement) has free templates you can download by email. Two other recurring items worth calendaring: the [Florida annual report](/guides/florida-annual-report) (due by May 1) and your [registered agent](/guides/florida-registered-agent).`;

const CLOSING = `## Ready to form your Florida LLC?

LaunchForma is an online formation service for Florida businesses, run by a husband and wife team and helping business owners since 2015. Florida LLC packages start at $149 with the state filing fee included, and the Popular package ($279) includes a custom Operating Agreement.

[Start your Florida LLC](/start)

*General information, not legal or tax advice.*`;

function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.q}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
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

export default async function FloridaFictitiousNameGuide() {
  const locale = await getLocale();
  if (locale === 'es') permanentRedirect(PATH);
  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ)} />
      <GuideLayout
        slug={SLUG}
        title={H1}
        description={LEAD}
        datePublished={PUBLISHED}
        dateModified={DATE_MODIFIED}
        inLanguage="en"
        readingMinutes={5}
      >
        <MarkdownBody markdown={BODY} locale="en" />
        <h2>FAQ</h2>
        <FaqList items={FAQ} />
        <MarkdownBody markdown={CLOSING} locale="en" />
      </GuideLayout>
    </>
  );
}
