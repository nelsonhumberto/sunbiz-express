import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'LaunchForma refund policy: 14-day refund window on service fees prior to state submission, state filing fees non-refundable once accepted, and how to cancel recurring services.',
  alternates: { canonical: '/refund-policy' },
};

export default function RefundPolicyPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-wider text-ink-subtle">
        Effective April 25, 2026
      </p>
      <h1>Refund Policy</h1>

      <p>
        LaunchForma believes business formation should be transparent end-to-end —
        including refunds. This policy explains exactly what is refundable, when,
        and what isn&apos;t.
      </p>

      <h2>1. Service fees — 14-day refund window</h2>
      <p>
        LaunchForma&apos;s <strong>service fee</strong> (the portion you pay us
        on top of the state filing fee) is fully refundable for 14 days after
        purchase, <strong>so long as we have not yet submitted your filing</strong>{' '}
        to the Secretary of State.
      </p>
      <ul>
        <li>No questions asked — email us and we&apos;ll process the refund.</li>
        <li>
          Once we submit your filing to the state, the service portion is no longer
          refundable because the work has been performed and the documents have
          been transmitted.
        </li>
      </ul>

      <h2>2. State filing fees — non-refundable once accepted</h2>
      <p>
        State filing fees are paid directly to the Secretary of State (Florida
        Department of State, Wyoming Secretary of State, or Delaware Division of
        Corporations). Once the state has accepted your filing,{' '}
        <strong>those fees are non-refundable</strong> per the state statute. This
        is true with every formation provider — the money has left our hands and
        is in the state&apos;s account.
      </p>
      <p>
        If the state{' '}
        <em>rejects</em> your filing (uncommon — typically a name conflict we
        catch first), we will resubmit at no additional charge or refund the full
        amount, your choice.
      </p>

      <h2>3. Recurring services — cancel any time</h2>
      <p>
        Recurring services — Registered Agent, Compliance Alerts Plus, Managed
        Annual Report, .com domain — can be cancelled any time before the next
        billing cycle:
      </p>
      <ul>
        <li>
          Cancellations take effect at the end of the current paid period — you
          keep service through the date you already paid for.
        </li>
        <li>
          Partial-period refunds are not issued; the service was rendered for
          that period.
        </li>
        <li>
          To cancel, email{' '}
          <a href="mailto:help@launchforma.com">help@launchforma.com</a>{' '}
          or use the cancellation link inside your account billing page.
        </li>
      </ul>

      <h2>4. Add-ons — refundable until delivered</h2>
      <p>
        Add-on services (EIN acquisition, Operating Agreement drafting, Certificate
        of Status, Certified Copy, S-Corp election) are refundable up until we
        begin work on them. Once delivered, they cannot be refunded because the
        work product is yours.
      </p>

      <h2>5. How to request a refund</h2>
      <p>
        Email{' '}
        <a href="mailto:help@launchforma.com">help@launchforma.com</a> from the
        address associated with your LaunchForma account and include your filing
        ID (visible in your dashboard) or business name. We respond within one
        business day and process eligible refunds back to the original payment
        method within 5-7 business days.
      </p>

      <h2>6. Disputes</h2>
      <p>
        We&apos;d much rather you email us than your credit card company — we&apos;ll
        almost always make it right. The full legal framework lives in our{' '}
        <Link href="/terms#refunds">Terms of Service, Section 6</Link>.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about this policy? Email{' '}
        <a href="mailto:help@launchforma.com">help@launchforma.com</a>.
      </p>
    </>
  );
}
