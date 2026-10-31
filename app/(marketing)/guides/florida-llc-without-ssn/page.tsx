import { englishBuyerMetadata, EnglishBuyerGuide } from '@/components/marketing/EnglishBuyerGuide';
import { WITHOUT_SSN_EN, WITHOUT_SSN_ES } from '@/lib/buyer-guide-hreflang';
import { floridaLlcGuideFees } from '@/lib/florida-llc-guide-fees';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

const PUBLISHED = '2026-10-28';
const fees = floridaLlcGuideFees();
const price = tierPriceParts('BASIC', 'LLC', 'FL');

const TITLE = 'Florida LLC without an SSN';
const DESCRIPTION = `You can form a Florida LLC without an SSN. The Sunbiz filing form has no SSN field. LaunchForma files it for you for ${formatCurrency(price.totalCents)} all in.`;

const FAQ = [
  {
    q: 'Can I form a Florida LLC without SSN?',
    a: 'Yes. Sunbiz has no SSN field on the Articles of Organization form. The form asks for the name, the addresses, and the registered agent.',
  },
  {
    q: 'Does Sunbiz ask for an SSN?',
    a: 'No. The Sunbiz filing form does not ask for an SSN.',
  },
  {
    q: 'Who issues an EIN if I have no SSN?',
    a: 'The EIN is issued by the IRS. If you do not have an SSN or an ITIN, you request it with Form SS-4.',
  },
];

const BODY = `## What the form asks for

You file Articles of Organization with the Division of Corporations on Sunbiz. The [instructions](https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/) cover the company name, the principal address, the mailing address, and a registered agent with a Florida street address. The agent signs to accept. An SSN is not on that form. This is general information, not legal advice.

The state fee is ${fees.total}: ${fees.filing} to file and ${fees.agent} to designate the registered agent. Source: [LLC fees](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/).

## A tax ID, if you need one

The EIN is issued by the IRS. If you do not have an SSN or an ITIN, you request it with [Form SS-4](https://www.irs.gov/instructions/iss4).

Whether you need an ITIN is a tax question. Talk to a CPA. This page is not tax advice.

## After the LLC exists

The annual report is due between January 1 and May 1 each year, starting the year after you form, for ${fees.annual}. See the [Florida annual report guide](/guides/florida-annual-report).

If you live outside Florida, read [Florida LLC for a non-resident](/guides/florida-llc-non-resident). The state fee table is in [how much a Florida LLC costs](/guides/florida-llc-cost). Packages are on [pricing](/pricing).
`;

const DISCLAIMER =
  'General information only, not legal or tax advice. LaunchForma is not a law firm.';

export function generateMetadata() {
  return englishBuyerMetadata({
    path: WITHOUT_SSN_EN,
    esTwin: WITHOUT_SSN_ES,
    title: TITLE,
    description: DESCRIPTION,
    published: PUBLISHED,
  });
}

export default function FloridaLlcWithoutSsnPage() {
  return (
    <EnglishBuyerGuide
      slug="florida-llc-without-ssn"
      title={TITLE}
      description={DESCRIPTION}
      published={PUBLISHED}
      readingMinutes={5}
      trackSource={WITHOUT_SSN_EN}
      markdown={BODY}
      faq={FAQ}
      disclaimer={DISCLAIMER}
    />
  );
}
