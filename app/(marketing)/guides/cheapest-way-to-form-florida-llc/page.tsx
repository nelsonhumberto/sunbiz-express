import { englishBuyerMetadata, EnglishBuyerGuide } from '@/components/marketing/EnglishBuyerGuide';
import { floridaLlcGuideFees } from '@/lib/florida-llc-guide-fees';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

const PATH = '/guides/cheapest-way-to-form-florida-llc';
const PUBLISHED = '2026-10-28';
const fees = floridaLlcGuideFees();
const price = tierPriceParts('BASIC', 'LLC', 'FL');

const TITLE = 'Cheapest way to form an LLC in Florida';
const DESCRIPTION = `The cheapest way to form a Florida LLC is to file on Sunbiz yourself for the ${formatCurrency(price.stateFeeCents)} state fee. Or LaunchForma files it for you for ${formatCurrency(price.totalCents)} all in.`;

const FAQ = [
  {
    q: 'What is the cheapest way to form an LLC in Florida?',
    a: `File the Articles of Organization yourself on Sunbiz and pay the state fee of ${fees.total}: ${fees.filing} to file and ${fees.agent} to designate a registered agent.`,
  },
  {
    q: 'Can I be my own Florida registered agent?',
    a: 'Yes, if you have a Florida street address and someone can be there during business hours. A P.O. Box does not qualify.',
  },
  {
    q: 'What does a Florida LLC cost every year?',
    a: `The annual report is ${fees.annual}, due between January 1 and May 1, starting the year after you form.`,
  },
];

const BODY = `## What the state requires

Sunbiz asks for a distinguishable name that includes Limited Liability Company, LLC, or L.L.C., a principal address, a mailing address, and a registered agent with a Florida street address. The agent signs to accept the job. The [instructions](https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/instructions/) list those items. They do not add a separate cheapest-path form.

The state fee is ${fees.total}: ${fees.filing} to file the Articles of Organization and ${fees.agent} to designate the registered agent. Source: [LLC fees](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/).

## File it yourself on Sunbiz

You can prepare and submit the Articles on Sunbiz and pay that state fee directly. That is the lowest amount the state charges to form the LLC. Nobody else's package can make the state fee smaller.

Check the name on Sunbiz before you file. A search is not a promise that the state will approve the name.

## Be your own registered agent

Every Florida LLC lists a registered agent at a Florida street address. You can serve yourself if you have that street address and can receive documents there during business hours. A P.O. Box does not work. If you do not have a Florida street address, you need an agent who does. See [what a Florida registered agent is](/guides/florida-registered-agent).

## The cost that continues

Forming the LLC is not the last state fee. Every Florida LLC files an annual report between January 1 and May 1, starting the year after the year you form. The on-time fee is ${fees.annual}. If the state receives it after May 1, the published fee is ${fees.late}. Details are on the [annual report page](https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/) and in our [Florida annual report guide](/guides/florida-annual-report).

Cities and counties may also charge a local business tax. That amount depends on the place and the type of work, so confirm it locally.

## When a service makes sense

Do it yourself when you are comfortable with the form, you can be the registered agent, and you will remember the annual report window.

A filing service is worth paying for when you want someone to check the name and the paperwork, to act as registered agent, to track the annual report date, or to answer questions. The price above includes the Florida state filing fee, so you do not pay that state fee again at checkout. LaunchForma files Florida LLCs online from our Miami Lakes office. We submit your filing within 1 business day. Approval timing is up to the state.

Current packages are on [pricing](/pricing). The state fee table is in [how much a Florida LLC costs](/guides/florida-llc-cost).
`;

const DISCLAIMER =
  'General information only, not legal or tax advice. LaunchForma is not a law firm. State fees change. Confirm them on dos.fl.gov before you file.';

export function generateMetadata() {
  return englishBuyerMetadata({
    path: PATH,
    title: TITLE,
    description: DESCRIPTION,
    published: PUBLISHED,
  });
}

export default function CheapestWayToFormFloridaLlcPage() {
  return (
    <EnglishBuyerGuide
      slug="cheapest-way-to-form-florida-llc"
      title={TITLE}
      description={DESCRIPTION}
      published={PUBLISHED}
      readingMinutes={6}
      trackSource={PATH}
      markdown={BODY}
      faq={FAQ}
      disclaimer={DISCLAIMER}
    />
  );
}
