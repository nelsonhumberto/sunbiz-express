import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const getGuestUser = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const paymentIntentsCreate = vi.hoisted(() => vi.fn());
const paymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const paymentIntentsUpdate = vi.hoisted(() => vi.fn());
const refundsCreate = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getGuestUser }));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique, update: vi.fn() },
    annualReport: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    coupon: { findUnique: vi.fn() },
    registeredAgentService: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    paymentIntents: {
      create: paymentIntentsCreate,
      retrieve: paymentIntentsRetrieve,
      update: paymentIntentsUpdate,
    },
    refunds: { create: refundsCreate },
    customers: { create: vi.fn() },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit,
  clientIp: () => '203.0.113.8',
}));
vi.mock('@/lib/utm-server', () => ({ getServerUtmAttribution: () => null }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

import { POST } from '@/app/api/stripe/payment-intent/route';

const OCTOBER_15_NOON_ET = new Date('2026-10-15T16:00:00.000Z');

function post(body: unknown, purpose?: string) {
  const params = new URLSearchParams();
  if (purpose) params.set('purpose', purpose);
  return POST({
    nextUrl: { searchParams: params },
    json: async () => body,
  } as never);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(OCTOBER_15_NOON_ET);
  auth.mockReset();
  getGuestUser.mockReset();
  filingFindUnique.mockReset();
  paymentIntentsCreate.mockReset();
  paymentIntentsRetrieve.mockReset();
  paymentIntentsUpdate.mockReset();
  refundsCreate.mockReset();
  rateLimit.mockReset();
  auth.mockResolvedValue(null);
  getGuestUser.mockResolvedValue(null);
  rateLimit.mockReturnValue({ ok: true, remaining: 9, retryAfterSeconds: 0 });
  paymentIntentsCreate.mockResolvedValue({
    id: 'pi_guest',
    client_secret: 'sec_guest',
    status: 'requires_payment_method',
    amount: 61_875,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guest annual report payment intent', () => {
  it('prices a logged-out checkout from the server year and ignores the client amount', async () => {
    const res = await post(
      {
        entityType: 'LLC',
        useOurRa: false,
        amountCents: 1,
        lateFeeCents: 0,
        reportYear: 2099,
        guestAttemptId: 'attempt-12345678',
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentIntentId).toBe('pi_guest');
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 61_875,
        metadata: expect.objectContaining({
          purpose: 'guest_annual_report',
          reportYear: '2026',
          entityType: 'LLC',
        }),
      }),
      { idempotencyKey: 'guest_ar_attempt-12345678_amt_61875' },
    );
    expect(filingFindUnique).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith('guest-annual-report:203.0.113.8', 10, 60_000);
  });

  it('prices a signed-in guest annual report without a filing', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    const res = await post(
      {
        entityType: 'CORP',
        useOurRa: true,
        amountCents: 50,
        reportYear: 2030,
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 63_000 + 15_000,
        metadata: expect.objectContaining({
          purpose: 'guest_annual_report',
          entityType: 'CORP',
          useOurRa: 'true',
          userId: 'user_1',
          reportYear: '2026',
        }),
      }),
      undefined,
    );
    expect(filingFindUnique).not.toHaveBeenCalled();
  });

  it('does not block a formation guest cookie from the public annual report checkout', async () => {
    getGuestUser.mockResolvedValue({ id: 'guest_cookie' });
    const res = await post(
      { entityType: 'LLC', useOurRa: false },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 61_875 }),
      undefined,
    );
  });

  it('returns 400 and does not create a PaymentIntent for a bad entity type', async () => {
    const res = await post(
      { entityType: 'NONPROFIT', useOurRa: false, amountCents: 21_875 },
      'guest_annual_report',
    );
    expect(res.status).toBe(400);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('rate limits guest annual report creation per IP', async () => {
    rateLimit.mockImplementation((key: string) => {
      if (String(key).startsWith('guest-annual-report:')) {
        return { ok: false, remaining: 0, retryAfterSeconds: 30 };
      }
      return { ok: true, remaining: 9, retryAfterSeconds: 0 };
    });
    const res = await post(
      { entityType: 'LLC', useOurRa: false },
      'guest_annual_report',
    );
    expect(res.status).toBe(429);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('reuses an open guest PaymentIntent and updates the amount to the server quote', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_open',
      status: 'requires_payment_method',
      amount: 21_875,
      client_secret: 'sec_open',
      metadata: { purpose: 'guest_annual_report' },
    });
    paymentIntentsUpdate.mockResolvedValue({
      id: 'pi_open',
      client_secret: 'sec_open',
      amount: 61_875,
    });
    const res = await post(
      {
        entityType: 'LLC',
        useOurRa: false,
        paymentIntentId: 'pi_open',
        amountCents: 1,
      },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentIntentId).toBe('pi_open');
    expect(paymentIntentsUpdate).toHaveBeenCalledWith(
      'pi_open',
      expect.objectContaining({ amount: 61_875 }),
    );
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('returns a succeeded guest PaymentIntent without creating or refunding another', async () => {
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_paid',
      status: 'succeeded',
      amount: 21_875,
      client_secret: 'sec_paid',
      metadata: { purpose: 'guest_annual_report' },
    });
    const res = await post(
      { entityType: 'LLC', useOurRa: false, paymentIntentId: 'pi_paid' },
      'guest_annual_report',
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ paymentIntentId: 'pi_paid', alreadySucceeded: true });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(paymentIntentsUpdate).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('still returns 401 before reading the body for a logged-out formation request', async () => {
    const json = vi.fn(async () => {
      throw new Error('body read');
    });
    const res = await POST({ json } as never);
    expect(res.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});
