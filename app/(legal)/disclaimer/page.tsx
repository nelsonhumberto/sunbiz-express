import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Legal Disclaimer',
  description:
    'LaunchForma is a private, independent self-help business formation service — not a law firm and not a government agency. Read our legal disclaimers covering government affiliation, document accuracy, state filing acceptance, compliance reminders, and tax advice.',
  alternates: { canonical: '/disclaimer' },
};

export default function DisclaimerPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-wider text-ink-subtle">Effective April 25, 2026</p>
      <h1>Legal Disclaimer</h1>

      <h2>Not a government agency</h2>
      <p>
        LaunchForma is a private, independent document-preparation and filing service. We are not
        a government agency, and we are <strong>not affiliated with, endorsed by, sponsored by, or
        acting on behalf of</strong> the Florida Department of State, the Internal Revenue Service
        (IRS), FinCEN, or any other federal, state, or local government agency.
      </p>
      <p>
        You are free to prepare and submit these filings yourself, directly with the government,
        and in many cases at a lower cost. For example, you can form a Florida business directly
        through the Florida Department of State at{' '}
        <a href="https://dos.fl.gov/sunbiz" target="_blank" rel="noopener noreferrer">
          sunbiz.org
        </a>
        , and you can apply for an EIN directly with the IRS at{' '}
        <a href="https://www.irs.gov" target="_blank" rel="noopener noreferrer">
          irs.gov
        </a>
        , where the IRS issues EINs at no cost. Our fees are charged for the convenience of having
        LaunchForma prepare and file the paperwork for you — not for the government documents
        themselves. Where a package includes a state filing fee, that fee is set by the government
        and remitted to the state on your behalf.
      </p>

      <h2>LaunchForma is not a law firm</h2>
      <p>
        LaunchForma provides self-help business formation services. We are not a law firm. We do
        not provide legal advice. The information we provide is general in nature and may not
        apply to your specific situation.
      </p>
      <p>
        For legal questions involving your business — including but not limited to: tax
        elections, securities offerings, professional licensing, multi-state operations,
        intellectual property, employment law, or contract disputes — you should consult a
        licensed attorney admitted to practice in Florida (or your relevant jurisdiction).
      </p>

      <h2>Document accuracy</h2>
      <p>
        The Articles of Organization, Operating Agreement, and other documents we generate are
        based entirely on information you provide. We do not verify, audit, or independently
        confirm the accuracy of your inputs.
      </p>
      <p>
        Errors arising from incorrect information you provide (typos, wrong addresses, incorrect
        ownership percentages, etc.) are your responsibility. We will gladly help you file a
        correction or amendment, but additional state fees may apply.
      </p>

      <h2>State filing acceptance</h2>
      <p>
        LaunchForma does not guarantee that the Florida Department of State will accept your
        filing. State approval is at the discretion of the Department of State. Common rejection
        reasons include: name conflicts, P.O. Box addresses for registered agents, missing
        information, or incomplete signatures. If your filing is rejected, we will notify you
        and assist with resubmission at no additional service charge.
      </p>

      <h2>Compliance reminders</h2>
      <p>
        Compliance reminders (annual report deadlines, etc.) are provided as a courtesy. While
        we make every effort to send accurate and timely reminders, you remain ultimately
        responsible for your own compliance. We are not liable for missed deadlines, late fees,
        or administrative dissolution.
      </p>

      <h2>Registered Agent service</h2>
      <p>
        If you use our Registered Agent service: we maintain a Florida physical address
        available during regular business hours, scan and forward incoming legal documents
        promptly, and notify you of receipt. We are not liable for documents that cannot be
        delivered due to outdated contact information you've provided to us.
      </p>

      <h2>Tax advice</h2>
      <p>
        LaunchForma does not provide tax advice. S-Corp election guidance, EIN application
        assistance, and similar services are administrative — not tax-strategic. Consult a
        licensed CPA for tax planning.
      </p>

      <h2>Questions?</h2>
      <p>
        Email <a href="mailto:legal@launchforma.com">legal@launchforma.com</a>.
      </p>
    </>
  );
}
