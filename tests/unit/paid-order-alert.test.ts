import { describe, expect, it } from 'vitest';
import { renderTemplate } from '@/lib/email';
import { formatCurrency } from '@/lib/utils';
import {
  OVERDUE_MS,
  OVERDUE_SOON_MS,
  filingOverdueBadge,
  formatEasternDateTime,
  paidAnnualReportDocumentNumber,
  paidOrderDeadline,
} from '@/lib/paid-order-alert';

const PAID_AT = new Date('2026-01-15T17:30:00.000Z');
const PAID_LABEL = 'Jan 15, 2026, 12:30 PM EST';
const DEADLINE_LABEL = 'Jan 16, 2026, 12:30 PM EST';

describe('paid order deadline and overdue badge', () => {
  it('sets the filing deadline 24 hours after payment, in Eastern time', () => {
    const deadline = paidOrderDeadline(PAID_AT);
    expect(deadline.getTime() - PAID_AT.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(formatEasternDateTime(PAID_AT)).toBe(PAID_LABEL);
    expect(formatEasternDateTime(deadline)).toBe(DEADLINE_LABEL);
    expect(PAID_LABEL).not.toMatch(/\u2014|\u2013/);
    expect(DEADLINE_LABEL).not.toMatch(/\u2014|\u2013/);
  });

  it('badges Overdue soon at 20 hours and Overdue at 24 hours', () => {
    const base = {
      sunbizFilingNumber: null as string | null,
      paidAt: PAID_AT,
    };
    const at = (ms: number) => new Date(PAID_AT.getTime() + ms);

    expect(filingOverdueBadge({ ...base, now: at(OVERDUE_SOON_MS - 60_000) })).toBeNull();
    expect(filingOverdueBadge({ ...base, now: at(OVERDUE_SOON_MS) })).toBe('overdue_soon');
    expect(filingOverdueBadge({ ...base, now: at(OVERDUE_MS - 1) })).toBe('overdue_soon');
    expect(filingOverdueBadge({ ...base, now: at(OVERDUE_MS) })).toBe('overdue');
    expect(
      filingOverdueBadge({
        sunbizFilingNumber: 'L26000000001',
        paidAt: PAID_AT,
        now: at(30 * 60 * 60 * 1000),
      }),
    ).toBeNull();
    expect(
      filingOverdueBadge({ sunbizFilingNumber: '   ', paidAt: PAID_AT, now: at(OVERDUE_MS) }),
    ).toBe('overdue');
    expect(filingOverdueBadge({ sunbizFilingNumber: null, paidAt: null, now: at(OVERDUE_MS) })).toBeNull();
  });
});

describe('admin paid order email', () => {
  const context = {
    businessName: 'Acme LLC',
    linkFilingId: 'fil_1',
    customerName: 'Ana Lopez',
    customerEmail: 'ana@example.com',
    orderState: 'FL',
    orderEntity: 'LLC',
    orderPlan: 'Essential',
    totalCents: 19900,
    paidAtLabel: PAID_LABEL,
    deadlineLabel: DEADLINE_LABEL,
    adminFilingUrl: 'https://launchforma.com/admin/filings/fil_1',
  };

  it('includes the filing facts, Eastern times, and admin link', () => {
    const mail = renderTemplate('ADMIN_PAID_ORDER', context);
    expect(mail.subject).toBe(`New paid order: Acme LLC (file by ${DEADLINE_LABEL})`);
    expect(mail.html).toContain('fil_1');
    expect(mail.html).toContain('Ana Lopez');
    expect(mail.html).toContain('ana@example.com');
    expect(mail.html).toContain('FL');
    expect(mail.html).toContain('LLC');
    expect(mail.html).toContain('Essential');
    expect(mail.html).toContain(formatCurrency(19900));
    expect(mail.html).toContain(PAID_LABEL);
    expect(mail.html).toContain(DEADLINE_LABEL);
    expect(mail.html).toContain('https://launchforma.com/admin/filings/fil_1');
    expect(mail.html).toContain('Open filing');
    expect(mail.html).not.toContain('do not file and refund');
    expect(mail.subject).not.toMatch(/\u2014|\u2013/);
    expect(mail.html).not.toMatch(/\u2014|\u2013/);
  });

  it('warns before filing a paid annual report in any status', () => {
    for (const status of ['FILED', 'PENDING', 'OVERDUE', 'DELINQUENT']) {
      expect(paidAnnualReportDocumentNumber({
        sunbizFilingNumber: 'L25000509630',
        annualReports: [{ status, totalCostCents: 63_775 }],
      })).toBe('L25000509630');
    }
    expect(paidAnnualReportDocumentNumber({
      sunbizFilingNumber: 'L25000509630',
      annualReports: [{ status: 'PENDING', totalCostCents: 0 }],
    })).toBeNull();
    expect(paidAnnualReportDocumentNumber({
      annualReports: [{ status: 'PENDING', totalCostCents: 13_875 }],
    })).toBe('');
  });

  it('tells admin to check live Sunbiz before filing a paid annual report', () => {
    const mail = renderTemplate('ADMIN_PAID_ORDER', {
      ...context,
      annualReportDocumentNumber: 'L25000509630',
    });
    const warning =
      'Before filing, check the company on live Sunbiz. If this year&#039;s annual report is already filed, do not file and refund the customer.';
    expect(mail.html).toContain(`<blockquote><strong>${warning}</strong></blockquote>`);
    expect(mail.html.indexOf(warning)).toBeLessThan(mail.html.indexOf('New paid order'));
    expect(mail.html).toContain(
      'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=DocumentNumber&amp;searchTerm=L25000509630',
    );
    expect(mail.html).toContain('Search L25000509630 on Sunbiz');
    expect(mail.html).not.toMatch(/\u2014|\u2013/);
    expect(mail.html).not.toMatch(/sourceFileDate|as of|freshness/i);
  });

  it('prefixes test orders and names the overdue window', () => {
    const testMail = renderTemplate('ADMIN_PAID_ORDER', { ...context, testOrder: true });
    expect(testMail.subject).toBe(`[TEST] New paid order: Acme LLC (file by ${DEADLINE_LABEL})`);

    const soon = renderTemplate('ADMIN_FILING_OVERDUE', { ...context, overdueKind: 'overdue_soon' });
    expect(soon.subject).toBe(`Overdue soon: Acme LLC (file by ${DEADLINE_LABEL})`);
    expect(soon.html).toContain('still has no state filing number');

    const late = renderTemplate('ADMIN_FILING_OVERDUE', { ...context, overdueKind: 'overdue' });
    expect(late.subject).toBe(`Overdue: Acme LLC (file by ${DEADLINE_LABEL})`);
  });
});
