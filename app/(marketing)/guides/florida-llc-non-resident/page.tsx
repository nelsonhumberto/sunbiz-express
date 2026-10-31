import { englishBuyerMetadata, EnglishBuyerGuide } from '@/components/marketing/EnglishBuyerGuide';
import { NONRESIDENT_EN, NONRESIDENT_ES } from '@/lib/buyer-guide-hreflang';
import { FLORIDA_ONLY_NOTE } from '@/lib/formation-states';
import { floridaLlcGuideFees } from '@/lib/florida-llc-guide-fees';

const PUBLISHED = '2026-10-28';
const fees = floridaLlcGuideFees();

const TITLE = 'Florida LLC for non-resident';
const DESCRIPTION =
  'You can form a Florida LLC as a non-resident. Sunbiz does not require you to live in the state. The registered agent needs a Florida street address.';

const FAQ = [
  {
    q: 'Can a non-resident form a Florida LLC?',
    a: 'Yes. The Sunbiz instructions ask for a name, addresses, and a registered agent. They do not require you to live in Florida.',
  },
  {
    q: 'Can the principal address be outside Florida?',
    a: 'Yes. The principal office can be outside Florida. The registered agent address still has to be a Florida street address.',
  },
  {
    q: 'Does LaunchForma form companies outside Florida?',
    a: FLORIDA_ONLY_NOTE.en,
  },
];

const BODY = `## No residency requirement

The [Sunbiz instructions](https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/) for Articles of Organization ask for the company name, the principal and mailing addresses, and a registered agent. They do not ask you to live in Florida or in the United States. A non-resident can form the LLC.

## Registered agent with a Florida street address

The registered agent needs a physical street address in Florida. A P.O. Box does not qualify. The agent signs to accept the appointment. If you do not have a Florida street address, you need an agent who does. See [what a Florida registered agent is](/guides/florida-registered-agent).

## The principal address can be outside Florida

The principal office address can be outside Florida. That can be the address where you actually live. The registered agent address is the one that has to be in Florida.

The state fee to form the LLC is ${fees.total} (${fees.filing} to file and ${fees.agent} for the registered agent). Source: [LLC fees](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/).

## Banking is the hard part

Forming the LLC and opening a bank account are different steps. Each bank sets its own document list and can decline the account. Ask the bank what it needs before the appointment. This page does not promise that a bank will open an account.

## Taxes

Taxes depend on your situation. This is general information, not tax advice. Talk to a CPA about your own case, including questions such as Form 5472.

The EIN is issued by the IRS. If you do not have an SSN or an ITIN, you request it with [Form SS-4](https://www.irs.gov/instructions/iss4) by fax or mail.

## Where we file

${FLORIDA_ONLY_NOTE.en}

The price above includes the Florida state filing fee. We submit your filing within 1 business day. Approval timing is up to the state. See [pricing](/pricing) and [how much a Florida LLC costs](/guides/florida-llc-cost). If you are filing without an SSN, read [Florida LLC without an SSN](/guides/florida-llc-without-ssn).
`;

const DISCLAIMER =
  'General information only, not legal or tax advice. LaunchForma is not a law firm. Talk to a CPA about your taxes.';

export function generateMetadata() {
  return englishBuyerMetadata({
    path: NONRESIDENT_EN,
    esTwin: NONRESIDENT_ES,
    title: TITLE,
    description: DESCRIPTION,
    published: PUBLISHED,
  });
}

export default function FloridaLlcNonResidentPage() {
  return (
    <EnglishBuyerGuide
      slug="florida-llc-non-resident"
      title={TITLE}
      description={DESCRIPTION}
      published={PUBLISHED}
      readingMinutes={6}
      trackSource={NONRESIDENT_EN}
      markdown={BODY}
      faq={FAQ}
      disclaimer={DISCLAIMER}
    />
  );
}
