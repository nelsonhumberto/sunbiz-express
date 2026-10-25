import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const getGuestUser = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());
const paymentIntentsCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getGuestUser }));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique, update: filingUpdate },
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

function filingOwnedBy(userId: string) {
  return {
    id: 'filing_1',
    userId,
    entityType: 'LLC',
    serviceTier: 'BASIC',
    state: 'FL',
    optionalDetails: null,
    checkoutPaymentIntentId: null,
    status: 'DRAFT',
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
  auth.mockReset();
  getGuestUser.mockReset();
  filingFindUnique.mockReset();
  userFindUnique.mockReset();
  filingUpdate.mockReset();
  paymentIntentsCreate.mockReset();
  userFindUnique.mockResolvedValue({
    id: 'user_1',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    stripeCustomerId: 'cus_1',
  });
  filingUpdate.mockResolvedValue({});
  paymentIntentsCreate.mockResolvedValue({
    id: 'pi_1',
    client_secret: 'sec',
    status: 'requires_payment_method',
    amount: 14900,
  });
});

describe('payment intent access', () => {
  it('returns 401 before reading the body when nobody is signed in', async () => {
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue(null);
    const json = vi.fn(async () => {
      throw new Error('body read');
    });
    const res = await POST({ json } as never);
    expect(res.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('returns 403 for a guest before reading the body', async () => {
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue({ id: 'guest_1' });
    const json = vi.fn();
    const res = await POST({ json } as never);
    expect(res.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('does not let a signed-in user pay another user filing', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    filingFindUnique.mockResolvedValue(filingOwnedBy('user_2'));
    const res = await POST({
      json: async () => ({ filingId: 'filing_1', amountCents: 50 }),
    } as never);
    expect(res.status).toBe(404);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('charges the server total for the owner and ignores the body amount', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    filingFindUnique.mockResolvedValue(filingOwnedBy('user_1'));
    const res = await POST({
      json: async () => ({ filingId: 'filing_1', amountCents: 50 }),
    } as never);
    expect(res.status).toBe(200);
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 14900 }),
      expect.anything(),
    );
  });

  it('returns 409 for a paid or submitted filing and does not call Stripe', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    filingFindUnique.mockResolvedValue({ ...filingOwnedBy('user_1'), status: 'SUBMITTED', payments: [] });
    const submitted = await POST({
      json: async () => ({ filingId: 'filing_1', amountCents: 50 }),
    } as never);
    expect(submitted.status).toBe(409);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();

    filingFindUnique.mockResolvedValue({
      ...filingOwnedBy('user_1'),
      status: 'DRAFT',
      payments: [{ id: 'pay_1' }],
    });
    const paid = await POST({
      json: async () => ({ filingId: 'filing_1', amountCents: 50 }),
    } as never);
    expect(paid.status).toBe(409);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});
