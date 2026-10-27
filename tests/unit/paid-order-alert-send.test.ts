import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, findUnique, findMany, sendEmail } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    emailNotification: { findFirst },
    filing: { findUnique, findMany },
  },
}));

vi.mock('@/lib/email', () => ({
  sendEmail,
}));

import {
  ADMIN_FILING_OVERDUE_TYPE,
  ADMIN_ORDER_EMAIL,
  ADMIN_PAID_ORDER_TYPE,
  notifyAdminOfPaidOrder,
  runPaidFilingOverdueAlerts,
} from '@/lib/paid-order-alert';

const PAID_AT = new Date('2026-01-15T17:30:00.000Z');

function filing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fil_1',
    userId: 'usr_1',
    businessName: 'Acme LLC',
    state: 'FL',
    entityType: 'LLC',
    serviceTier: 'BASIC',
    isTest: false,
    sunbizFilingNumber: null,
    user: {
      firstName: 'Ana',
      lastName: 'Lopez',
      email: 'ana@example.com',
      isTester: false,
    },
    payments: [
      {
        status: 'SUCCEEDED',
        amountCents: 19900,
        isTest: false,
        completedAt: PAID_AT,
        createdAt: PAID_AT,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  findFirst.mockReset();
  findUnique.mockReset();
  findMany.mockReset();
  sendEmail.mockReset();
  findFirst.mockResolvedValue(null);
  sendEmail.mockResolvedValue({ id: 'em_1' });
});

describe('notifyAdminOfPaidOrder', () => {
  it('sends once, then skips when the notification row already exists', async () => {
    findUnique.mockResolvedValue(filing());

    await expect(notifyAdminOfPaidOrder('fil_1')).resolves.toBe('sent');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ADMIN_PAID_ORDER_TYPE,
        to: ADMIN_ORDER_EMAIL,
        filingId: 'fil_1',
        context: expect.objectContaining({
          totalCents: 19900,
          testOrder: false,
          customerEmail: 'ana@example.com',
          orderPlan: 'Essential',
          adminFilingUrl: expect.stringContaining('/admin/filings/fil_1'),
        }),
      }),
    );

    findFirst.mockResolvedValue({ id: 'note_1' });
    await expect(notifyAdminOfPaidOrder('fil_1')).resolves.toBe('skipped');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenLastCalledWith({
      where: { filingId: 'fil_1', notificationType: ADMIN_PAID_ORDER_TYPE },
      select: { id: true },
    });
  });

  it('prefixes tester and isTest orders without throwing', async () => {
    findUnique.mockResolvedValue(filing({ user: { ...filing().user, isTester: true } }));
    await notifyAdminOfPaidOrder('fil_1');
    expect(sendEmail.mock.calls[0][0].context.testOrder).toBe(true);

    sendEmail.mockClear();
    findUnique.mockResolvedValue(
      filing({
        payments: [{ ...filing().payments[0], isTest: true }],
      }),
    );
    await notifyAdminOfPaidOrder('fil_1');
    expect(sendEmail.mock.calls[0][0].context.testOrder).toBe(true);
  });

  it('logs and returns failed when lookup throws', async () => {
    findFirst.mockRejectedValue(new Error('db down'));
    await expect(notifyAdminOfPaidOrder('fil_1')).resolves.toBe('failed');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('adds the Sunbiz document number only for a paid annual report', async () => {
    findUnique.mockResolvedValue(filing());
    await notifyAdminOfPaidOrder('fil_1');
    expect(sendEmail.mock.calls[0][0].context.annualReportDocumentNumber).toBeUndefined();

    sendEmail.mockClear();
    findUnique.mockResolvedValue(
      filing({
        sunbizFilingNumber: 'L25000509630',
        annualReports: [{ status: 'FILED', totalCostCents: 63_775 }],
      }),
    );
    await notifyAdminOfPaidOrder('fil_1');
    expect(sendEmail.mock.calls[0][0].context.annualReportDocumentNumber).toBe('L25000509630');

    sendEmail.mockClear();
    findUnique.mockResolvedValue(
      filing({
        sunbizFilingNumber: 'L25000509630',
        annualReports: [{ status: 'PENDING', totalCostCents: 63_775 }],
      }),
    );
    await notifyAdminOfPaidOrder('fil_1');
    expect(sendEmail.mock.calls[0][0].context.annualReportDocumentNumber).toBe('L25000509630');
  });
});

describe('runPaidFilingOverdueAlerts', () => {
  it('queries unpaid-number filings and sends one overdue-soon email at 20 hours', async () => {
    const now = PAID_AT.getTime() + 20 * 60 * 60 * 1000;
    findMany.mockResolvedValue([filing()]);

    const first = await runPaidFilingOverdueAlerts(now);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ sunbizFilingNumber: null }, { sunbizFilingNumber: '' }],
          payments: { some: { status: 'SUCCEEDED' } },
        },
      }),
    );
    expect(first).toEqual({ scanned: 1, sent: 1, skipped: 0 });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ADMIN_FILING_OVERDUE_TYPE,
        to: ADMIN_ORDER_EMAIL,
        context: expect.objectContaining({ overdueKind: 'overdue_soon' }),
      }),
    );

    findFirst.mockResolvedValue({ id: 'note_overdue' });
    const second = await runPaidFilingOverdueAlerts(now);
    expect(second).toEqual({ scanned: 1, sent: 0, skipped: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('skips filings under 20 hours, test orders, and numbered filings', async () => {
    const now = PAID_AT.getTime() + 20 * 60 * 60 * 1000;
    findMany.mockResolvedValue([
      filing({ id: 'early' }),
      filing({ id: 'tester', user: { ...filing().user, isTester: true } }),
      filing({
        id: 'testpay',
        payments: [{ ...filing().payments[0], isTest: true }],
      }),
      filing({ id: 'numbered', sunbizFilingNumber: 'L26000000001' }),
    ]);

    const earlyNow = PAID_AT.getTime() + 19 * 60 * 60 * 1000;
    findMany.mockResolvedValueOnce([filing({ id: 'early' })]);
    const under = await runPaidFilingOverdueAlerts(earlyNow);
    expect(under.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();

    findMany.mockResolvedValue([
      filing({ id: 'tester', user: { ...filing().user, isTester: true } }),
      filing({
        id: 'testpay',
        payments: [{ ...filing().payments[0], isTest: true }],
      }),
      filing({ id: 'numbered', sunbizFilingNumber: 'L26000000001' }),
    ]);
    const skipped = await runPaidFilingOverdueAlerts(now);
    expect(skipped.sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('says Overdue when the first scan is already 24 hours past payment', async () => {
    findMany.mockResolvedValue([filing()]);
    const now = PAID_AT.getTime() + 24 * 60 * 60 * 1000;
    await runPaidFilingOverdueAlerts(now);
    expect(sendEmail.mock.calls[0][0].context.overdueKind).toBe('overdue');
  });
});
