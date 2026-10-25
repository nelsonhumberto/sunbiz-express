import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { GuideLayout } from '@/components/marketing/GuideLayout';
import { MarkdownBody } from '@/components/marketing/MarkdownBody';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import { withLocaleMeta } from '@/lib/locale-seo';

const PUBLISHED = '2026-10-25';
const DATE_MODIFIED = '2026-10-25';
const PATH = '/guides/how-to-reinstate-a-florida-llc';
const SLUG = 'how-to-reinstate-a-florida-llc';

const TITLE = 'How to Reinstate a Dissolved Florida LLC (2026)';
const H1 = 'How to Reinstate a Dissolved Florida LLC';
const DESCRIPTION =
  'Florida LLC administratively dissolved? How to check status on Sunbiz, file reinstatement online, the $100 fee plus $138.75 per missed report year.';
const LEAD =
  'If your Florida LLC missed its annual report, the state may have administratively dissolved it. The good news: Florida lets you apply for reinstatement at any time after the dissolution, and you can do it yourself online on Sunbiz. This guide covers why it happens, what it costs, and the steps.';

const FAQ = [
  {
    q: 'Why was my Florida LLC administratively dissolved?',
    a: 'Usually because the annual report was not filed in time. The statute also lists unpaid fees or penalties, no registered agent, and not reporting a change to the agent\'s name or address (s. 605.0714).',
  },
  {
    q: 'How much does it cost to reinstate a Florida LLC?',
    a: 'Sunbiz lists a $100.00 reinstatement fee plus $138.75 for each annual report year due.',
  },
  {
    q: 'Can I reinstate my Florida LLC myself?',
    a: 'Yes. Sunbiz has an online reinstatement application. You need your document number, the registered agent\'s signature, current company information and a form of payment.',
  },
  {
    q: 'How long does Florida LLC reinstatement take?',
    a: 'If the LLC was dissolved less than one calendar year, online reinstatements paid by card or Prepaid Sunbiz E-File Account post immediately. If more than one calendar year, allow 2 to 3 business days. Check or money order filings are processed in the order received.',
  },
  {
    q: 'Is there a deadline to reinstate?',
    a: 'The statute says an administratively dissolved LLC may apply for reinstatement at any time after the effective date of dissolution (s. 605.0715(1)).',
  },
  {
    q: 'What happens if my LLC name is no longer available?',
    a: 'If another business lawfully took the name, the state requires your LLC to amend its articles to change its name before it accepts the reinstatement (s. 605.0715(6)).',
  },
  {
    q: 'Does reinstatement cover the time my LLC was dissolved?',
    a: 'The statute says reinstatement relates back to the effective date of the dissolution, and the LLC may resume its activities as if it had not been dissolved (s. 605.0715(4)).',
  },
];

const BODY = `*This is general information, not legal or tax advice. Fees are from the Florida Department of State and can change; confirm on the linked official pages before you file.*

## Why Florida LLCs get administratively dissolved

The most common reason is a missed annual report. Sunbiz says annual reports are due by the third Friday in September to avoid administrative dissolution, and the statute says dissolution for failure to file an annual report happens on the fourth Friday in September each year (s. 605.0714(1)(a) and (2)). In 2026, those Fridays were September 18 and September 25.

The statute lists other grounds too: not paying a fee or penalty owed, not keeping a registered agent, or not reporting a change to the agent's name or address (s. 605.0714(1)(b) to (d)).

Remember the annual report itself is due earlier: filings after May 1 carry a $400 late fee. See our [Florida annual report guide](/guides/florida-annual-report).

Sources: [Florida Statutes s. 605.0714](https://www.flsenate.gov/Laws/Statutes/2025/605.0714), [Sunbiz: File Annual Report](https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/)

## What dissolution means for your LLC

An administratively dissolved LLC still exists, but it may only carry on activities needed to wind up its affairs (s. 605.0714(5)). Its registered agent's authority to receive service of process continues (s. 605.0714(6)).

## How to check your LLC's status on Sunbiz

1. Go to the [Sunbiz search by name](https://search.sunbiz.org/Inquiry/CorporationSearch/ByName).
2. Open your company's record and look at the status.
3. Write down your **document number**. You will need it to reinstate. It is also on any notice the state sent you.

## What reinstatement is

Sunbiz describes a reinstatement as an application that returns an administratively dissolved or revoked entity to active status. Under s. 605.0715, once it is effective, the reinstatement relates back to the date of the dissolution and the LLC may resume its activities as if the dissolution had not occurred (s. 605.0715(4)).

Sources: [Florida Statutes s. 605.0715](https://www.flsenate.gov/Laws/Statutes/2025/605.0715), [Sunbiz: File Reinstatement](https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/)

## What it costs (official Sunbiz fees)

| Item | State fee |
|---|---|
| LLC reinstatement fee | $100.00 |
| Each annual report year due | $138.75 |

Example of the math only: an LLC owing one report year would pay $100.00 + $138.75 = $238.75 in state fees. Your actual total depends on how many report years are due, and the statute requires all fees and penalties owed at the rates in effect when you apply (s. 605.0715(1)).

Florida charges $100 plus $138.75 for each annual report year due. There is no $400 late fee on a reinstatement. The $400 late fee applies only to annual reports filed late by an active company. Our service is $149.

Sources: [Sunbiz LLC fees](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/), [Sunbiz: File Reinstatement](https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/)

## What you need before you start

- Your **document number**.
- A **registered agent** who will sign. The application must be signed by both the registered agent and an authorized representative of the LLC (s. 605.0715(1)).
- **Current company information:** principal office and mailing address, your FEIN (or whether one has been applied for), and the name, title and address of at least one person with authority to manage the company (s. 605.0715(1)).
- A **form of payment**: credit or debit card or a Prepaid Sunbiz E-File Account online, or a check or money order by mail with the payment voucher.

Note: information you submit on a reinstatement application becomes part of the public record on Sunbiz.

## How to reinstate on Sunbiz yourself, step by step

You can do this yourself. Sunbiz offers an online reinstatement application.

1. **Find your record** and document number on Sunbiz.
2. **Read the instructions** on the [Sunbiz reinstatement page](https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/).
3. **Start the online application** and enter your document number. The form shows the most current data on file.
4. **Update anything that changed.** Sunbiz lets you change managers or authorized representatives, the registered agent and registered office, the principal and mailing addresses, and add or change the FEIN.
5. **Sign.** Typing your name in the signature block is sufficient. Never type someone else's name without permission.
6. **Pay** the reinstatement fee plus each report year due.
7. **Download a copy** of the filed reinstatement from Sunbiz once it posts. It is free.

## How long it takes

According to Sunbiz:

- **Dissolved less than one calendar year:** online reinstatements post immediately when paid by credit card or a Prepaid Sunbiz E-File Account.
- **Dissolved more than one calendar year:** allow 2 to 3 business days, because Florida law requires the office to check the name for availability.
- **Paid by check or money order:** processed in the order received.

## What if someone took your LLC's name?

A dissolved LLC's name is not available to another business until 1 year after the dissolution, unless the dissolved LLC permits it in writing (s. 605.0715(5)). After that, if another business has lawfully taken the name, the state requires your LLC to amend its articles of organization to change its name before it accepts the reinstatement (s. 605.0715(6)). The online reinstatement form cannot change your name; Sunbiz says to use the amendment form and mail it with payment.

## Reinstatement vs forming a new LLC

Reinstatement brings back the same company, with the same document number, and relates back to the dissolution date. A new LLC is a different entity with a new formation date. Which one fits depends on your situation (for example contracts, bank accounts and licenses in the old LLC's name), so talk to a professional if you are unsure. If you do decide to start fresh, see [how to form an LLC in Florida](/guides/how-to-form-an-llc-in-florida).

## Out of scope: other kinds of dissolution

This guide covers administrative dissolution under s. 605.0714. If the LLC dissolved voluntarily, or was dissolved by a court, the process is different and is not covered here.

## After you reinstate

- Put next year's annual report on your calendar (January 1 to May 1).
- Make sure your [registered agent](/guides/florida-registered-agent) details are current.
- Review your company records. Our [Florida LLC Operating Agreement guide](/guides/florida-llc-operating-agreement) has free templates.`;

const CLOSING = `## Want us to file it for you?

LaunchForma files the Florida LLC reinstatement for you for $149 plus state fees. You can also do it yourself on Sunbiz using the steps above.

If Sunbiz requires a different amount when we file, we will contact you before filing. We never charge more without your OK.

[Reinstate your Florida LLC](/reinstate-llc)

LaunchForma is an online formation service for Florida businesses, run by a husband and wife team and helping business owners since 2015.

*This is general information, not legal or tax advice.*`;

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
    const t = await getTranslations('guideFlReinstate');
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
          locale: 'es_US',
          publishedTime: PUBLISHED,
          modifiedTime: `${DATE_MODIFIED}T00:00:00.000Z`,
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
        modifiedTime: `${DATE_MODIFIED}T00:00:00.000Z`,
      },
    },
    locale,
  );
}

export default async function HowToReinstateFloridaLlcGuide() {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('guideFlReinstate');
    const faq = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
    return (
      <>
        <JsonLd data={faqPageJsonLd(faq, { inLanguage: 'es' })} />
        <GuideLayout
          slug={SLUG}
          title={t('title')}
          description={t('description')}
          datePublished={PUBLISHED}
          dateModified={DATE_MODIFIED}
          inLanguage="es"
          readingMinutes={8}
        >
          <MarkdownBody markdown={t('body')} locale="es" />
          <h2>{t('faqHeading')}</h2>
          <FaqList items={faq} />
          <MarkdownBody markdown={t('closing')} locale="es" />
        </GuideLayout>
      </>
    );
  }

  return (
    <>
      <JsonLd data={faqPageJsonLd(FAQ, { inLanguage: 'en' })} />
      <GuideLayout
        slug={SLUG}
        title={H1}
        description={LEAD}
        datePublished={PUBLISHED}
        dateModified={DATE_MODIFIED}
        inLanguage="en"
        readingMinutes={8}
      >
        <MarkdownBody markdown={BODY} locale="en" />
        <h2>FAQ</h2>
        <FaqList items={FAQ} />
        <MarkdownBody markdown={CLOSING} locale="en" />
      </GuideLayout>
    </>
  );
}
