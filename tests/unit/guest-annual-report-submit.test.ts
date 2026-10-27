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
const fetchDetail = vi.hoisted(() => vi.fn());

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
  fetchFloridaEntityDetailByDocumentNumber: fetchDetail,
  searchSunbiz: vi.fn(),
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
  fetchDetail.mockReset();
  fetchDetail.mockResolvedValue({
    corporation_number: 'L12345678901',
    corporation_name: 'Ada LLC',
    status: 'ACTIVE',
    filing_type: 'FLAL',
    filing_type_display: 'Florida Limited Liability Company',
    file_date: '2015-04-10',
    annual_reports: [{ year: 2025 }],
  });
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

  it('does not save a filing when the report status cannot be confirmed', async () => {
    retrieve.mockResolvedValue({
      id: 'pi_guest_1',
      status: 'succeeded',
      amount: 63_775,
      livemode: false,
      payment_method: null,
    });
    fetchDetail.mockRejectedValue(new Error('SUNBIZDAILY_API_KEY missing'));
    const result = await submitGuestAnnualReport(input());
    expect(result).toEqual({
      ok: false,
      error: "We couldn't confirm this company's annual report status online.",
    });
    expect(JSON.stringify(result)).not.toMatch(/SUNBIZ|API_KEY/);
    expect(transaction).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('applies the keeper fixtures at submit', async () => {
    retrieve.mockResolvedValue({
      id: 'pi_guest_1',
      status: 'succeeded',
      amount: 63_775,
      livemode: false,
      payment_method: null,
    });
    const blocked = [
      {
        documentNumber: 'L15000021030',
        detail: {
          corporation_number: 'L15000021030',
          corporation_name: 'SOUTHERN HOLDINGS 9 LLC',
          status: 'ACTIVE',
          filing_type: 'FLAL',
          file_date: '2015-04-10',
          annual_reports: [{ year: 2026 }],
        },
        error: 'Nothing due until Jan 1, 2027.',
      },
      {
        documentNumber: 'L26000537730',
        detail: {
          corporation_number: 'L26000537730',
          corporation_name: 'New LLC',
          status: 'ACTIVE',
          filing_type: 'FLAL',
          file_date: '10/19/2026',
        },
        error: 'Nothing due until Jan 1, 2027.',
      },
      {
        documentNumber: 'L25000294800',
        detail: {
          corporation_number: 'L25000294800',
          corporation_name: 'Closed LLC',
          status: 'ADMIN DISSOLVED',
          filing_type: 'FLAL',
          file_date: '2025-01-15',
        },
        error: 'This company is dissolved and needs reinstatement. We are not selling a filing.',
      },
    ];
    for (const item of blocked) {
      fetchDetail.mockResolvedValue(item.detail);
      const result = await submitGuestAnnualReport(input({ documentNumber: item.documentNumber }));
      expect(result, item.documentNumber).toEqual({ ok: false, error: item.error });
      expect(transaction).not.toHaveBeenCalled();
    }

    fetchDetail.mockResolvedValue({
      corporation_number: 'L25000509630',
      corporation_name: 'Open 2025 LLC',
      status: 'ACTIVE',
      filing_type: 'FLAL',
      filing_type_display: 'Florida Limited Liability Company',
      file_date: '2025-04-02',
      annual_reports: [],
    });
    const sold = await submitGuestAnnualReport(input({
      documentNumber: 'L25000509630',
      entityType: 'CORP',
    }));
    expect(sold.ok).toBe(true);
    expect(annualReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reportYear: 2026, totalCostCents: 63_775 }),
      }),
    );
  });

  it('stores the corporation type from a P document prefix', async () => {
    retrieve.mockResolvedValue({
      id: 'pi_guest_1',
      status: 'succeeded',
      amount: 64_900,
      livemode: false,
      payment_method: null,
    });
    fetchDetail.mockResolvedValue({
      corporation_number: 'P26QA000001',
      corporation_name: 'Ada Corp',
      status: 'ACTIVE',
      file_date: '2019-05-01',
      annual_reports: [],
    });
    const filingCreate = vi.fn(async () => ({ id: 'filing_corp' }));
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        filing: { create: filingCreate },
        managerMember: { create: async () => ({}) },
        annualReport: { create: annualReportCreate },
        payment: { create: async () => ({}) },
      }),
    );
    const result = await submitGuestAnnualReport(input({
      documentNumber: 'P26QA000001',
      entityType: 'LLC',
    }));
    expect(result.ok).toBe(true);
    expect(filingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'CORP' }),
      }),
    );
  });
});
