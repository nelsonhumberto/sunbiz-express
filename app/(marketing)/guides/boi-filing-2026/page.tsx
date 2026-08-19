import type { Metadata } from 'next';
import { GuideLayout } from '@/components/marketing/GuideLayout';

const PUBLISHED = '2026-05-27';

export const metadata: Metadata = {
  title: 'BOI Filing 2026: What Every LLC and Corporation Must Know',
  description:
    'A 2026 guide to the FinCEN Beneficial Ownership Information report under the Corporate Transparency Act - who has to file, what to report, the 30-day rules, exemptions, and penalties.',
  alternates: { canonical: '/guides/boi-filing-2026' },
  openGraph: {
    title: 'BOI Filing 2026 - What Every LLC and Corporation Must Know',
    description:
      'Comprehensive 2026 guide to the FinCEN BOI report: deadlines, exemptions, penalties, and how to file.',
    type: 'article',
    publishedTime: PUBLISHED,
  },
};

export default function BoiFiling2026Guide() {
  return (
    <GuideLayout
      slug="boi-filing-2026"
      title="BOI Filing 2026: What Every LLC and Corporation Must Know"
      description="The Corporate Transparency Act requires most U.S. LLCs and Corporations to file Beneficial Ownership Information with FinCEN. Here is the 2026 state of the rule - who has to file, what to report, and the penalties for getting it wrong."
      datePublished={PUBLISHED}
      readingMinutes={11}
      cta={{
        headline: 'Let us file your BOI for $49',
        subhead:
          'Encrypted intake, internal compliance review, FinCEN submission, and 30-day update tracking for the first 12 months.',
        href: '/boi-reporting',
        label: 'See BOI service',
      }}
    >
      <h2>What is the BOI report?</h2>
      <p>
        A Beneficial Ownership Information (BOI) report is a filing with the
        U.S. Treasury&apos;s Financial Crimes Enforcement Network (FinCEN)
        that identifies the individuals who ultimately own or control a U.S.
        business entity. It was created by the federal{' '}
        <em>Corporate Transparency Act</em>{' '}
        (CTA), signed into law in 2021, with enforcement phased in over
        2024&ndash;2025.
      </p>
      <p>
        The goal: make it harder to use anonymous shell companies for money
        laundering, sanctions evasion, tax fraud, and other illicit finance.
        Whether you agree with the policy or not, the obligation is real and
        the penalties are steep.
      </p>

      <h2>Who has to file?</h2>
      <p>
        Most domestic LLCs, Corporations, limited partnerships, and similar
        entities formed in any U.S. state must file - that&apos;s the default
        position. Foreign entities registered to do business in the U.S. must
        also file.
      </p>
      <p>
        There are <strong>23 statutory exemptions</strong>, designed to avoid
        duplicating disclosures already made under other federal regimes.
        The most common ones founders ask about:
      </p>
      <ul>
        <li>
          <strong>Large operating company.</strong> More than 20 full-time U.S.
          employees, more than $5 million in gross U.S. receipts on the prior
          year&apos;s tax return, and a physical U.S. office. All three must
          be true.
        </li>
        <li>
          <strong>Publicly traded company</strong> (registered with the SEC).
        </li>
        <li>
          <strong>Banks, credit unions, broker-dealers, registered investment
          advisers, insurance companies</strong>, and other regulated
          financial entities.
        </li>
        <li>
          <strong>Tax-exempt 501(c) entities</strong> and entities owned
          entirely by tax-exempt entities.
        </li>
        <li>
          <strong>Subsidiaries</strong> of certain exempt entities, owned and
          controlled entirely by them.
        </li>
        <li>
          <strong>Inactive entities</strong> meeting strict criteria (existed
          before 2020, not engaged in active business, no foreign owners, no
          assets, no recent ownership change, etc.).
        </li>
      </ul>
      <p>
        If you are a small operating LLC, holding company, real-estate LLC, or
        single-member LLC - you are almost certainly not exempt and you do
        have to file.
      </p>

      <h2>When is the deadline?</h2>
      <p>
        Deadlines depend on when the entity was created:
      </p>
      <ul>
        <li>
          Entities created or registered{' '}
          <strong>on or after January 1, 2025</strong>: must file within{' '}
          <strong>30 days</strong> of formation.
        </li>
        <li>
          Entities created in <strong>2024</strong>: had until{' '}
          <strong>January 13, 2025</strong> (FinCEN extended this from 90
          days).
        </li>
        <li>
          Entities created <strong>before January 1, 2024</strong>: originally
          had until January 1, 2025.
        </li>
      </ul>
      <p>
        Any change to beneficial-ownership information - new owner, name
        change, address change for a beneficial owner, new driver license - must
        be reported within <strong>30 days</strong> of the change.
      </p>
      <p>
        <strong>Note:</strong> BOI enforcement has been actively litigated. The
        Treasury Department has paused enforcement and reissued guidance
        multiple times since 2024. As of mid-2026, the safe path is to file
        on time and update within 30 days of any change. Confirm current
        enforcement status at{' '}
        <a
          href="https://www.fincen.gov/boi"
          target="_blank"
          rel="noopener noreferrer"
        >
          fincen.gov/boi
        </a>{' '}
        before relying on any deadline.
      </p>

      <h2>What do you have to report?</h2>
      <h3>For the reporting company</h3>
      <ul>
        <li>Full legal name and any DBAs</li>
        <li>Current U.S. street address (no P.O. Boxes)</li>
        <li>State or tribal jurisdiction of formation</li>
        <li>Taxpayer Identification Number (EIN)</li>
      </ul>
      <h3>For each beneficial owner</h3>
      <p>
        A <em>beneficial owner</em> is any individual who either:
      </p>
      <ul>
        <li>Owns or controls at least <strong>25%</strong> of the ownership interests of the reporting company; OR</li>
        <li>Exercises <strong>substantial control</strong> over the reporting company - senior officers, anyone with authority to appoint or remove officers/directors, anyone with significant decision-making authority over the business.</li>
      </ul>
      <p>For each beneficial owner:</p>
      <ul>
        <li>Full legal name</li>
        <li>Date of birth</li>
        <li>Current residential address</li>
        <li>
          A unique identifying number from a non-expired U.S. driver license,
          U.S. state or tribal ID, or passport - plus a clear image of that
          document
        </li>
      </ul>
      <h3>For each company applicant</h3>
      <p>
        Only required for entities formed or registered{' '}
        <strong>on or after January 1, 2024</strong>. A company applicant is
        the person who directly filed the document forming the entity, plus
        (if different) the person who directed or controlled the filing. Same
        four fields as for beneficial owners.
      </p>

      <h2>Penalties for non-compliance</h2>
      <p>
        Willful failure to file, or filing false information, can carry:
      </p>
      <ul>
        <li>
          Civil penalties of up to <strong>$500 per day</strong> the violation
          continues (adjusted annually for inflation; currently ~$606/day in
          2026 dollars).
        </li>
        <li>
          Criminal penalties of up to <strong>$10,000</strong> and/or up to{' '}
          <strong>2 years imprisonment</strong>.
        </li>
      </ul>
      <p>
        There is a safe harbor for inadvertent errors corrected within 90 days
        of the original filing. The penalty regime is aimed at willful
        non-compliance, but FinCEN&apos;s enforcement posture has been firm.
      </p>

      <h2>How to file</h2>
      <p>
        FinCEN&apos;s official portal is{' '}
        <a
          href="https://www.fincen.gov/boi"
          target="_blank"
          rel="noopener noreferrer"
        >
          fincen.gov/boi
        </a>
        . Filing is free. You upload a JSON or PDF form and the IDs for each
        beneficial owner.
      </p>
      <p>
        If you would rather not deal with the encryption, the ID upload, the
        30-day update obligation, and the storage of sensitive PII - {' '}
        <a href="/boi-reporting">LaunchForma offers managed BOI filing for $49</a>.
        We prepare, review, submit, and track changes for 12 months.
      </p>

      <h2>Frequently asked</h2>
      <h3>Does the state I formed in matter?</h3>
      <p>
        No. BOI is a federal requirement that applies to entities formed in
        any U.S. state.
      </p>
      <h3>Does my SSN have to be in the report?</h3>
      <p>
        No. The ID requirement is satisfied by your U.S. driver license, state
        ID, or passport - not your SSN. You only provide the entity&apos;s EIN
        (the SSN would come up only if you used your SSN as the entity&apos;s
        tax ID, which is unusual for an LLC).
      </p>
      <h3>What if my ownership changes?</h3>
      <p>
        File an updated BOI report within 30 days of the change. The most
        common triggers are: new investor, member buyout, change in
        residential address of a beneficial owner, or replacement of a senior
        officer.
      </p>
      <h3>Is there a separate filing for foreign owners?</h3>
      <p>
        No. The same BOI report covers U.S. and foreign beneficial owners. A
        foreign beneficial owner uses a foreign passport as their ID document
        and provides the country of issuance.
      </p>

      <p className="not-prose text-xs text-ink-subtle mt-8">
        LaunchForma is not a law firm. This guide reflects the 2026 state of
        the rule and may go out of date as enforcement evolves. Confirm
        current rules at{' '}
        <a
          href="https://www.fincen.gov/boi"
          target="_blank"
          rel="noopener noreferrer"
        >
          fincen.gov/boi
        </a>{' '}
        before relying on any deadline or exemption.
      </p>
    </GuideLayout>
  );
}
