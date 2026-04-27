export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <>
      <p className="text-xs uppercase tracking-wider text-ink-subtle">Effective April 25, 2026</p>
      <h1>Privacy Policy</h1>

      <h2>1. What we collect</h2>
      <p>
        To form your business, we collect information you provide: name, email, phone, business
        name, addresses, member/officer details, signatures, and payment information. We also
        collect basic analytics (IP address, device, pages viewed) to improve the service.
      </p>

      <h2>2. Why we collect it</h2>
      <p>
        We use this data exclusively to: (a) form your business with the Florida Department of
        State, (b) deliver the services you purchased, (c) maintain compliance reminders, and
        (d) improve the platform.
      </p>

      <h2>3. We do not sell your data</h2>
      <p>
        IncServices does <strong>not</strong> sell, lease, rent, or share your personal
        information with marketing partners, data brokers, or advertisers. Ever. This is a core
        promise.
      </p>

      <h2>4. Who we share with</h2>
      <p>Only those required to deliver the service:</p>
      <ul>
        <li>
          <strong>Florida Department of State</strong> — to file your formation documents
        </li>
        <li>
          <strong>Stripe</strong> — to process payments (PCI-DSS Level 1 certified)
        </li>
        <li>
          <strong>SendGrid</strong> — to send transactional emails
        </li>
        <li>
          <strong>Namecheap</strong> — only if you purchase a domain
        </li>
      </ul>

      <h2>5. How we secure data</h2>
      <p>
        TLS 1.2+ in transit. AES-256 at rest. Role-based access control. Audit logging. Regular
        third-party security reviews. Passwords are hashed with bcrypt — we never see your
        plaintext password.
      </p>

      <h2>6. Your rights (GDPR + CCPA)</h2>
      <ul>
        <li>
          <strong>Access:</strong> request a copy of your data at any time
        </li>
        <li>
          <strong>Correction:</strong> update inaccurate information
        </li>
        <li>
          <strong>Deletion:</strong> request account deletion (subject to 7-year FL retention)
        </li>
        <li>
          <strong>Opt-out:</strong> unsubscribe from marketing emails (transactional emails are
          required for service delivery)
        </li>
      </ul>

      <h2>7. Cookies</h2>
      <p>
        We use only essential cookies (session, auth) and aggregated analytics. We respect Do Not
        Track headers.
      </p>

      <h2>8. Data retention</h2>
      <p>
        Florida law requires us to retain business formation records for 7 years. After that
        period, we delete or anonymize records on request.
      </p>

      <h2>9. Contact</h2>
      <p>
        Privacy questions? Email{' '}
        <a href="mailto:privacy@incservices.example">privacy@incservices.example</a>.
      </p>
    </>
  );
}
