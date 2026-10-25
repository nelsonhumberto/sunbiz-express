import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { tierPriceParts } from '@/lib/pricing';
import { withLocaleMeta } from '@/lib/locale-seo';
import { formatCurrency } from '@/lib/utils';

const CORP_ESSENTIAL = tierPriceParts('BASIC', 'CORP', 'FL');

const PUBLISHED = '2026-10-24';
const PATH = '/guides/how-to-form-a-florida-corporation';
const SLUG = 'how-to-form-a-florida-corporation';

const TITLE = 'How to Form a Florida Corporation: Steps, Fees & Filing';
const H1 = 'How to Form a Florida Corporation';
const DESCRIPTION =
  'Form a Florida corporation step by step: name check, registered agent, Articles of Incorporation, bylaws, EIN, and annual report. Sunbiz fees cited.';
const LEAD =
  'A Florida profit corporation is formed by filing Articles of Incorporation with the Florida Department of State, Division of Corporations (Sunbiz). This guide walks through each step, the state fees as Sunbiz lists them, and what to do after the state approves your filing.';

const FAQ = [
  {
    q: 'How much does it cost to form a corporation in Florida?',
    a: 'Sunbiz lists a $35.00 filing fee plus a $35.00 registered agent designation, for $70.00 in required state fees. A certified copy ($8.75) and a certificate of status ($8.75) are optional, for a total of $87.50.',
  },
  {
    q: 'What do the Florida Articles of Incorporation need to include?',
    a: 'Under section 607.0202(1): the corporate name, the principal office address, the number of authorized shares, the registered office and registered agent with the agent\'s written acceptance, and the name and address of each incorporator.',
  },
  {
    q: 'Does my corporation name need "Inc." or "Corp."?',
    a: 'Yes. Section 607.0401(1)(a) requires a word such as "corporation," "company," or "incorporated," or an abbreviation such as "Corp.," "Inc.," or "Co."',
  },
  {
    q: 'How many directors does a Florida corporation need?',
    a: 'One or more individuals, with the number set in the articles of incorporation or the bylaws (s. 607.0803(1)).',
  },
  {
    q: 'Do I file bylaws with Sunbiz?',
    a: 'Bylaws are not among the items the Articles of Incorporation must include (s. 607.0202(1)). They are adopted by the incorporators or the board (s. 607.0206(1)) and kept with your corporate records.',
  },
  {
    q: 'When is the Florida corporation annual report due?',
    a: 'Between January 1 and May 1 each year, starting the year after the corporation is formed (s. 607.1622(4)). Sunbiz lists $150.00, or $550.00 if received after May 1st.',
  },
  {
    q: 'Should my corporation elect S corporation status?',
    a: 'That is a federal tax decision to discuss with a tax professional. See the IRS page on S corporations for general information.',
  },
];

const BODY = `## Step 1: Choose and check your corporate name

Under section 607.0401(1)(a), Florida Statutes, a corporate name:

> Must contain the word "corporation," "company," or "incorporated" or the abbreviation "Corp.," or "Inc.," or "Co.," or the designation "Corp," or "Inc," or "Co," as will clearly indicate that it is a corporation instead of a natural person, partnership, or other eligible entity.

Search the Sunbiz records to see whether a similar name is already on file. A search is not a guarantee that the state will approve the name.

## Step 2: Appoint a Florida registered agent

Every Florida corporation must keep a registered agent and a registered office in Florida. Section 607.0501(1) says the corporation "shall designate and continuously maintain in this state" a registered office and a registered agent, which can be an individual who resides in Florida or an authorized entity, with a business address identical to the registered office. The agent must also accept the appointment in writing (s. 607.0501(3)).

Learn more in our [Florida registered agent guide](/guides/florida-registered-agent).

## Step 3: File Articles of Incorporation

Section 607.0202(1) lists what the articles must include:

> (a) A corporate name for the corporation that satisfies the requirements of s. 607.0401;
> (b) The street address of the initial principal office and, if different, the mailing address of the corporation;
> (c) The number of shares the corporation is authorized to issue;
> (d) The street address of the corporation's initial registered office and the name of its initial registered agent at that office together with a written acceptance as required in s. 607.0501(3); and
> (e) The name and address of each incorporator.

You can file online through Sunbiz or have a filing service prepare and submit it for you.

### Florida state fees (from Sunbiz)

From the Division of Corporations fees page, "New Florida/Foreign Corporation":

| Item | Fee |
| --- | --- |
| Filing Fees | $35.00 |
| Registered Agent Designation | $35.00 |
| Certified Copy (optional) | $8.75 |
| Certificate of Status (optional) | $8.75 |
| Total (with both optional items) | $87.50 |

The required fees add up to $70.00. Source: https://dos.fl.gov/sunbiz/forms/fees/ (checked October 24, 2026). Fees can change, so confirm on Sunbiz before you file.

## Step 4: Name directors and appoint officers

- **Directors:** "A board of directors must consist of one or more individuals, with the number specified in or fixed in accordance with the articles of incorporation or bylaws" (s. 607.0803(1)). Initial directors may be listed in the articles (s. 607.0202(2)(a)).
- **Officers:** "A corporation shall have the officers described in its bylaws or appointed by the board of directors in accordance with the bylaws" (s. 607.08401(1)).

## Step 5: Get an EIN from the IRS

An Employer Identification Number (EIN) is a federal tax ID issued by the IRS, not by Florida. You apply directly with the IRS: [Get an Employer Identification Number (IRS)](https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number). Banks usually ask for it when you open a business account.

## Step 6: Adopt bylaws

Under section 607.0206(1), "The incorporators or board of directors of a corporation shall adopt initial bylaws for the corporation unless that power is reserved to the shareholders by the articles of incorporation." Bylaws are internal rules. They are not among the items the articles must include, and you keep them with your corporate records. Consider having an attorney help with them.

## Step 7: File the annual report every year

Section 607.1622(4) says the first annual report "must be delivered to the department between January 1 and May 1 of the year following the calendar year in which a domestic corporation's articles of incorporation became effective," and each year after that between January 1 and May 1.

Sunbiz lists the Profit Annual Report (with supplemental fee) at $150.00, and $550.00 if received after May 1st. See our [Florida annual report guide](/guides/florida-annual-report) or [let us file it for you](/file-annual-report).

## Step 8: Check your county (and city) business tax receipt

Many Florida counties and cities charge a local business tax, often called a business tax receipt. Florida Statutes chapter 205 defines "local business tax" as "the fees charged and the method by which a local governing authority grants the privilege of engaging in or managing any business, profession, or occupation within its jurisdiction" (s. 205.022). Requirements and fees depend on your county and city, so check with your local tax collector. Professional licenses, if your activity needs one, are separate.

## Corporation vs LLC, in general terms

| | Corporation | LLC |
| --- | --- | --- |
| Florida law | Chapter 607 | Chapter 605 |
| Formation document | Articles of Incorporation | Articles of Organization |
| Owners | Shareholders | Members |
| Internal rules | Bylaws | Operating agreement |
| Management | Board of directors and officers | Members or managers |
| Required Florida filing fees (Sunbiz) | $70.00 | $125.00 |
| Annual report fee (Sunbiz) | $150.00 | $138.75 |

Some owners choose a corporation for its formal structure of shares, directors, and officers. Others prefer an LLC's flexibility. Which fits you depends on your plans, so consider talking to an attorney or CPA.

**S corporation election:** this is a federal tax election, not a Florida filing. Whether it makes sense is a question to discuss with a tax professional. General information is on the IRS site: [S corporations (IRS)](https://www.irs.gov/businesses/small-businesses-self-employed/s-corporations). LaunchForma does not give tax advice.

Comparing options? Read [How to form an LLC in Florida](/guides/how-to-form-an-llc-in-florida) and our [Florida LLC operating agreement guide](/guides/florida-llc-operating-agreement).

## Form your Florida corporation with LaunchForma

Our 24/7 AI assistant guides your order, and our team prepares and files your Articles of Incorporation with the State of Florida. Corporation packages start at ${formatCurrency(CORP_ESSENTIAL.totalCents)} all-in (service fee ${formatCurrency(CORP_ESSENTIAL.serviceCents)} + Florida state fee ${formatCurrency(CORP_ESSENTIAL.stateFeeCents)}), as shown on our [pricing page](/pricing).

[Start your Florida corporation](/start?entity=CORP)`;

const TAIL = `## Related guides

- [Florida annual report guide](/guides/florida-annual-report)
- [Florida registered agent guide](/guides/florida-registered-agent)
- [How to form an LLC in Florida](/guides/how-to-form-an-llc-in-florida)
- [Florida LLC operating agreement](/guides/florida-llc-operating-agreement)
- [Pricing](/pricing)

## Official sources

- Florida Division of Corporations, fees: https://dos.fl.gov/sunbiz/forms/fees/
- Florida Statutes s. 607.0202 (articles of incorporation; content): https://www.flsenate.gov/Laws/Statutes/2025/607.0202
- Florida Statutes s. 607.0206 (bylaws): https://www.flsenate.gov/Laws/Statutes/2025/607.0206
- Florida Statutes s. 607.0401 (corporate name): https://www.flsenate.gov/Laws/Statutes/2025/607.0401
- Florida Statutes s. 607.0501 (registered office and agent): https://www.flsenate.gov/Laws/Statutes/2025/607.0501
- Florida Statutes s. 607.0803 (number of directors): https://www.flsenate.gov/Laws/Statutes/2025/607.0803
- Florida Statutes s. 607.08401 (required officers): https://www.flsenate.gov/Laws/Statutes/2025/607.08401
- Florida Statutes s. 607.1622 (annual report): https://www.flsenate.gov/Laws/Statutes/2025/607.1622
- Florida Statutes s. 205.022 (local business tax definitions): https://www.flsenate.gov/Laws/Statutes/2025/205.022
- IRS, Get an EIN: https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number
- IRS, S corporations: https://www.irs.gov/businesses/small-businesses-self-employed/s-corporations`;

const DISCLAIMER =
  'This page is general information, not legal or tax advice. LaunchForma is not a law firm. Consider talking to an attorney or tax professional about your situation.';

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
  if (locale === 'es') {
    const t = await getTranslations('guideFlCorp');
    const title = t('metaTitle');
    const description = t('metaDescription');
    return withLocaleMeta(
      PATH,
      {
        title: { absolute: title },
        description,
        openGraph: {
          title,
          description,
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
      title: { absolute: TITLE },
      description: DESCRIPTION,
      openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        type: 'article',
        publishedTime: PUBLISHED,
      },
    },
    locale,
  );
}

export default async function HowToFormFloridaCorporationGuide() {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlCorp');
    const faq = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
    return (
      <>
        <JsonLd data={faqPageJsonLd(faq, { inLanguage: 'es' })} />
        <GuideLayout
          slug={SLUG}
          title={t('title')}
          description={t('description')}
          datePublished={PUBLISHED}
          dateModified={PUBLISHED}
          inLanguage="es"
          readingMinutes={8}
          cta={{
            headline: t('ctaHeadline'),
            subhead: t('ctaSubhead'),
            href: '/start?entity=CORP',
            label: t('ctaLabel'),
          }}
        >
          <MarkdownBody markdown={t('body')} locale="es" />
          <h2>{t('faqHeading')}</h2>
          <FaqList items={faq} />
          <MarkdownBody markdown={t('tail')} locale="es" />
          <p className="not-prose text-xs text-ink-subtle mt-8">{t('disclaimer')}</p>
        </GuideLayout>
      </>
    );
  }

  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ)} />
      <GuideLayout
        slug={SLUG}
        title={H1}
        description={LEAD}
        datePublished={PUBLISHED}
        dateModified={PUBLISHED}
        inLanguage="en"
        readingMinutes={8}
        cta={{
          headline: 'Form your Florida corporation with LaunchForma',
          subhead:
            'Our 24/7 AI assistant guides your order, and our team prepares and files your Articles of Incorporation with the State of Florida.',
          href: '/start?entity=CORP',
          label: 'Start your Florida corporation',
        }}
      >
        <MarkdownBody markdown={BODY} locale="en" />
        <h2>FAQ</h2>
        <FaqList items={FAQ} />
        <MarkdownBody markdown={TAIL} locale="en" />
        <p className="not-prose text-xs text-ink-subtle mt-8">{DISCLAIMER}</p>
      </GuideLayout>
    </>
  );
}
