export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-wider text-ink-subtle">Effective April 25, 2026</p>
      <h1>Terms of Service</h1>

      <h2>1. Service Description</h2>
      <p>
        Sunbiz Express is a self-help business formation platform that assists Florida residents
        and entrepreneurs in filing Articles of Organization (LLC) and Articles of Incorporation
        (Corporation) with the Florida Department of State, Division of Corporations.
      </p>
      <p>
        <strong>We are not a law firm.</strong> We do not provide legal advice. The information
        and forms we provide are not a substitute for legal counsel. For legal questions specific
        to your situation, you should consult a licensed Florida attorney.
      </p>

      <h2>2. User Responsibilities</h2>
      <p>
        You warrant that all information you submit through our platform is true, complete, and
        accurate. You are solely responsible for verifying information before submission. We are
        not liable for filing errors arising from incorrect information you provide.
      </p>

      <h2>3. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Sunbiz Express's total liability is limited to
        the amount you paid for our services. We are not liable for state filing rejections,
        delays caused by the Florida Department of State, or consequential damages.
      </p>

      <h2>4. Disclaimer of Warranties</h2>
      <p>
        The platform is provided "as-is" without warranty of any kind. We do not guarantee state
        approval, error-free service, or specific outcomes.
      </p>

      <h2>5. Third-Party Services</h2>
      <p>
        We integrate with third-party services including Stripe (payments), SendGrid (email), and
        the Florida Department of State (filings). Your use of those services is governed by
        their own terms.
      </p>

      <h2 id="refunds">6. Refund Policy</h2>
      <p>
        <strong>Service fees</strong> are refundable for 14 days after purchase if we have not
        yet submitted your filing to the Florida Department of State.
      </p>
      <p>
        <strong>State filing fees</strong> are paid directly to the Florida Department of State.
        Once accepted by the state, those fees are non-refundable per Florida statute.
      </p>
      <p>
        <strong>Recurring services</strong> (Registered Agent, Compliance Alerts, Annual Report
        Filing) can be cancelled at any time before the next billing cycle. Refunds for partial
        periods are not provided.
      </p>

      <h2>7. Account Termination</h2>
      <p>
        We may suspend or terminate accounts engaged in fraud, abuse, or violation of these
        terms. You may delete your account at any time by emailing support — we will retain
        records as required by Florida law (typically 7 years).
      </p>

      <h2>8. Changes to These Terms</h2>
      <p>
        We may update these terms with reasonable notice. Continued use after changes constitutes
        acceptance.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions? Email{' '}
        <a href="mailto:legal@sunbizexpress.example">legal@sunbizexpress.example</a>.
      </p>
    </>
  );
}
