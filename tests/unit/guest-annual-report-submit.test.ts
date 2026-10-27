import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());
const retrieve = vi.hoisted(() => vi.fn());
const refundsCreate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const userCreate = vi.hoisted(() => vi.fn());
const paymentFindUnique = vi.hoisted(() => vi.fn());
const annualReportCreate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/email', () => ({ sendEmail }));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: { retrieve },
    refunds: { create: refundsCreate },
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: userFindUnique, create: userCreate },
    payment: { findUnique: paymentFindUnique },
    $transaction: transaction,
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkActionRateLimit: () => null,
  rateLimit: () => ({ ok: true, remaining: 1, retryAfterSeconds: 0 }),
  clientIp: () => '203.0.113.8',
}));
vi.mock('@/lib/sunbiz', () => ({
  fetchFloridaEntityDetailByDocumentNumber: vi.fn(async () => ({
    corporation_number: 'L12345678901',
    corporation_name: 'Ada LLC',
    status: 'ACTIVE',
    filing_type: 'FLAL',
    filing_type_display: 'Florida Limited Liability Company',
    annual_reports: [{ year: 2025 }],
  })),
}));

import { submitGuestAnnualReport } from '@/actions/annual-report';

const OCTOBER_15_NOON_ET = new Date('2026-10-15T16:00:00.000Z');

const address = {
  street1: '1 Main St',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
};

function input(extra: Record<string, unknown> = {}) {
  return {
    documentNumber: 'L12345678901',
    guestEmail: 'ada@example.com',
    companyName: 'Ada LLC',
    entityType: 'LLC' as const,
    registeredAgentName: 'Ada Lovelace',
    registeredAgentAddress: address,
    useOurRa: false,
    principalAddress: address,
    mailingAddress: address,
    officers: [{ name: 'Ada Lovelace', title: 'MGR' }],
    signingOfficerName: 'Ada Lovelace',
    termsAccepted: true as const,
    paymentIntentId: 'pi_guest_1',
    reportYear: 2099,
    ...extra,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(OCTOBER_15_NOON_ET);
  auth.mockReset();
  sendEmail.mockReset();
  retrieve.mockReset();
  refundsCreate.mockReset();
  userFindUnique.mockReset();
  userCreate.mockReset();
  paymentFindUnique.mockReset();
  annualReportCreate.mockReset();
  transaction.mockReset();
  auth.mockResolvedValue(null);
  sendEmail.mockResolvedValue({ status: 'SENT' });
  userFindUnique.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: 'user_new' });
  paymentFindUnique.mockResolvedValue(null);
  annualReportCreate.mockResolvedValue({ id: 'ar_1' });
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      filing: { create: async () => ({ id: 'filing_new' }) },
      managerMember: { create: async () => ({}) },
      annualReport: { create: annualReportCreate },
      payment: { create: async () => ({ id: 'pay_1' }) },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('submitGuestAnnualReport', () => {
  it('alerts with both amounts when the paid total does not match the server year', async () => {
    retrieve.mockResolvedValue({
      id: 'pi_guest_1',
      status: 'succeeded',
      amount: 21_875,
      livemode: false,
      payment_method: null,
    });
    const result = await submitGuestAnnualReport(input());
    expect(result).toEqual({
      ok: false,
      error: 'Payment amount mismatch. Please contact support.',
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ANNUAL_REPORT_UNSAVED',
        context: {
          unsavedChargeDetail: expect.stringContaining('pi_guest_1'),
        },
      }),
    );
    const detail = sendEmail.mock.calls[0][0].context.unsavedChargeDetail as string;
    expect(detail).toContain('21875');
    expect(detail).toContain('63775');
    expect(detail).toContain('No refund was issued.');
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores the Eastern year from the server, not the client report year', async () => {
    retrieve.mockResolvedValue({
      id: 'pi_guest_1',
      status: 'succeeded',
      amount: 63_775,
      livemode: false,
      payment_method: { id: 'pm_1', card: { last4: '4242', brand: 'visa' }, billing_details: {} },
    });
    const result = await submitGuestAnnualReport(input());
    expect(result.ok).toBe(true);
    expect(annualReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportYear: 2026, lateFeeCents: 40_000 }),
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});
