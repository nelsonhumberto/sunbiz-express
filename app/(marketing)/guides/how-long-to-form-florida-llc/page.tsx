import { englishBuyerMetadata, EnglishBuyerGuide } from '@/components/marketing/EnglishBuyerGuide';
import { floridaLlcGuideFees } from '@/lib/florida-llc-guide-fees';

const PATH = '/guides/how-long-to-form-florida-llc';
const PUBLISHED = '2026-10-28';
const fees = floridaLlcGuideFees();

const TITLE = 'How long does it take to form an LLC in Florida';
const DESCRIPTION =
  'Sunbiz processes Florida LLC filings in the order received. Check the state Document Processing Dates page for the current dates. LaunchForma submits within 1 business day.';

const FAQ = [
  {
    q: 'How long does it take to form an LLC in Florida?',
    a: 'Sunbiz processes filings in the order received. The state posts the dates it is working through on its Document Processing Dates page. Those dates change, so the page is the current source. LaunchForma submits your filing within 1 business day. State approval time is separate.',
  },
  {
    q: 'Does LaunchForma promise a state approval date?',
    a: 'No. We submit your filing within 1 business day. Approval timing is up to the state.',
  },
  {
    q: 'Where do I see the current Sunbiz dates?',
    a: 'On the Division of Corporations Document Processing Dates page at dos.fl.gov.',
  },
];

const BODY = `## Sunbiz works in the order received

The Division of Corporations processes documents in the order it receives them. It does not publish a fixed number of days that applies to every LLC. The state updates a public list of the dates it is currently working on.

Check that list here: [Document Processing Dates](${fees.processingDates}). Use the date on that page, not a guess from a blog, when you need to know where the state's queue stands.

Online filings and mailed filings are not the same stack. The processing dates page is where the state separates them.

## What we submit

Filing within 1 business day is when LaunchForma submits your filing to Sunbiz. It is not when the state approves the LLC. Approval timing is up to the state. We do not promise a state turnaround.

The state fee is ${fees.total} (${fees.filing} to file and ${fees.agent} for the registered agent). It is included in the price above. Source: [LLC fees](https://dos.fl.gov/sunbiz/forms/fees/llc-fees/).

## After the state accepts the filing

Approval is not the same thing as opening a bank account or getting a local license. Those steps have their own requirements. The annual report is a later deadline, between January 1 and May 1, starting the year after you form. See [how much a Florida LLC costs](/guides/florida-llc-cost) and [pricing](/pricing).
`;

const DISCLAIMER =
  'General information only, not legal or tax advice. LaunchForma is not a law firm. Confirm current state dates on dos.fl.gov.';

export function generateMetadata() {
  return englishBuyerMetadata({
    path: PATH,
    title: TITLE,
    description: DESCRIPTION,
    published: PUBLISHED,
  });
}

export default function HowLongToFormFloridaLlcPage() {
  return (
    <EnglishBuyerGuide
      slug="how-long-to-form-florida-llc"
      title={TITLE}
      description={DESCRIPTION}
      published={PUBLISHED}
      readingMinutes={5}
      trackSource={PATH}
      markdown={BODY}
      faq={FAQ}
      disclaimer={DISCLAIMER}
    />
  );
}
