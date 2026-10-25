import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';

describe('DOMAIN_REGISTER copy', () => {
  it('names the order, links the filing, and includes a preferred domain when present', () => {
    const { subject, html } = renderTemplate('DOMAIN_REGISTER', {
      businessName: 'Acme LLC',
      domainFilingId: 'fil_1',
      domainCustomerName: 'Jane Doe',
      domainCustomerEmail: 'jane@example.com',
      domainAdminUrl: 'https://launchforma.com/admin/filings/fil_1',
      domainPreferred: 'acme.com',
    });

    expect(subject).toBe('[Domain to register] Premium order Acme LLC');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('jane@example.com');
    expect(html).toContain('Acme LLC');
    expect(html).toContain('href="https://launchforma.com/admin/filings/fil_1"');
    expect(html).toContain('fil_1');
    expect(html).toContain('acme.com');
    expect(html).not.toMatch(/—|–/);
    expect(subject).not.toMatch(/—|–/);
  });

  it('uses the filing id in the subject and says the domain was not collected', () => {
    const { subject, html } = renderTemplate('DOMAIN_REGISTER', {
      domainFilingId: 'fil_abc',
      domainCustomerName: 'Jane Doe',
      domainCustomerEmail: 'jane@example.com',
      domainAdminUrl: 'https://launchforma.com/admin/filings/fil_abc',
    });

    expect(subject).toBe('[Domain to register] Premium order fil_abc');
    expect(html).toContain('Not collected');
    expect(html).not.toMatch(/—|–/);
  });
});
