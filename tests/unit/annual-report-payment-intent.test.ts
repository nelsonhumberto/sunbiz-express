import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const getGuestUser = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const annualReportFindUnique = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());
const paymentIntentsCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getGuestUser }));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique, update: filingUpdate },
    annualReport: { findUnique: annualReportFindUnique },
    user: { findUnique: userFindUnique, update: vi.fn() },
    coupon: { findUnique: vi.fn() },
    registeredAgentService: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: { create: paymentIntentsCreate, retrieve: vi.fn(), update: vi.fn() },
    customers: { create: vi.fn() },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => '203.0.113.5',
}));
vi.mock('@/lib/utm-server', () => ({ getServerUtmAttribution: () => null }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

import { POST } from '@/app/api/stripe/payment-intent/route';

const OCTOBER_15_NOON_ET = new Date('2026-10-15T16:00:00.000Z');

const address = {
  street1: '1 Main St',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
};

const validDraft = {
  registeredAgentName: 'Ada Lovelace',
  registeredAgentAddress: address,
  useOurRa: false,
  principalAddress: address,
  mailingAddress: address,
  officers: [{ name: 'Ada Lovelace', title: 'MGR' }],
  signingOfficerName: 'Ada Lovelace',
  termsAccepted: true,
};

function filingOwnedBy(userId: string, state = 'FL') {
  return {
    id: 'filing_1',
    userId,
    entityType: 'LLC',
    serviceTier: 'BASIC',
    state,
    optionalDetails: null,
    checkoutPaymentIntentId: null,
    status: 'APPROVED',
    payments: [],
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    filingAdditionalServices: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(OCTOBER_15_NOON_ET);
  auth.mockReset();
  getGuestUser.mockReset();
  filingFindUnique.mockReset();
  annualReportFindUnique.mockReset();
  userFindUnique.mockReset();
  filingUpdate.mockReset();
  paymentIntentsCreate.mockReset();
  auth.mockResolvedValue({ user: { id: 'user_1' } });
  userFindUnique.mockResolvedValue({
    id: 'user_1',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    stripeCustomerId: 'cus_1',
  });
  filingFindUnique.mockResolvedValue(filingOwnedBy('user_1'));
  filingUpdate.mockResolvedValue({});
  paymentIntentsCreate.mockResolvedValue({
    id: 'pi_1',
    client_secret: 'sec',
    status: 'requires_payment_method',
    amount: 21_875,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function post(body: unknown) {
  return POST({ json: async () => body } as never);
}

describe('annual report payment intent', () => {
  it('returns 400 and does not create a PaymentIntent when the draft is invalid', async () => {
    const res = await post({
      filingId: 'filing_1',
      purpose: 'annual_report',
      annualReportId: 'ar_1',
      annualReport: { registeredAgentName: '' },
      amountCents: 1,
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(annualReportFindUnique).not.toHaveBeenCalled();
  });

  it('charges the on-time total for a 2027 report in October 2026', async () => {
    annualReportFindUnique.mockResolvedValue({
      id: 'ar_1',
      filingId: 'filing_1',
      status: 'PENDING',
      reportYear: 2027,
    });
    const res = await post({
      filingId: 'filing_1',
      purpose: 'annual_report',
      annualReportId: 'ar_1',
      annualReport: validDraft,
      amountCents: 61_875,
    });
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 21_875 }),
      undefined,
    );
  });

  it('charges the late total for a 2026 report in October 2026', async () => {
    annualReportFindUnique.mockResolvedValue({
      id: 'ar_1',
      filingId: 'filing_1',
      status: 'PENDING',
      reportYear: 2026,
    });
    const res = await post({
      filingId: 'filing_1',
      purpose: 'annual_report',
      annualReportId: 'ar_1',
      annualReport: validDraft,
      amountCents: 21_875,
    });
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 61_875 }),
      undefined,
    );
  });

  it('does not add the Florida late fee to a Wyoming annual report', async () => {
    filingFindUnique.mockResolvedValue(filingOwnedBy('user_1', 'WY'));
    annualReportFindUnique.mockResolvedValue({
      id: 'ar_1',
      filingId: 'filing_1',
      status: 'PENDING',
      reportYear: 2026,
    });
    const res = await post({
      filingId: 'filing_1',
      purpose: 'annual_report',
      annualReportId: 'ar_1',
      annualReport: validDraft,
    });
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 14_000 }),
      undefined,
    );
  });
});
