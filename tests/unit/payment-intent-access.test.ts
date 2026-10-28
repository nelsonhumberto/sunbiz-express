import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => vi.fn());
const getGuestUser = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());
const userUpdate = vi.hoisted(() => vi.fn());
const paymentIntentsCreate = vi.hoisted(() => vi.fn());
const paymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const paymentIntentsUpdate = vi.hoisted(() => vi.fn());
const customersUpdate = vi.hoisted(() => vi.fn());
const couponFindUnique = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn((_name: string) => null as string | null));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getGuestUser }));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique, update: filingUpdate },
    user: { findUnique: userFindUnique, update: userUpdate },
    coupon: { findUnique: couponFindUnique },
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
    customers: { create: vi.fn(), update: customersUpdate },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ ok: true }),
  clientIp: () => '203.0.113.5',
}));
vi.mock('@/lib/utm-server', () => ({ getServerUtmAttribution: () => null }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
  headers: () => ({ get: (name: string) => headerGet(name) }),
}));

import { POST } from '@/app/api/stripe/payment-intent/route';
import { tierPackagePriceCents } from '@/lib/pricing';

/** Pre-deploy Popular price still stored on real drafts. */
const STALE_POPULAR_CENTS = 27_900;
const POPULAR_FL_LLC_CENTS = tierPackagePriceCents('STANDARD', 'LLC', 'FL');

/** Server-computed Essential Florida LLC total. The client amount must not win. */
const ESSENTIAL_FL_LLC_CENTS = tierPackagePriceCents('BASIC', 'LLC', 'FL');

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
  userUpdate.mockReset();
  customersUpdate.mockReset();
  headerGet.mockReset();
  headerGet.mockReturnValue(null);
  paymentIntentsCreate.mockReset();
  paymentIntentsRetrieve.mockReset();
  paymentIntentsUpdate.mockReset();
  couponFindUnique.mockReset();
  couponFindUnique.mockResolvedValue(null);
  userUpdate.mockResolvedValue({});
  customersUpdate.mockResolvedValue({});
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
    amount: ESSENTIAL_FL_LLC_CENTS,
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

  it('lets the guest who owns the draft pay after the real email is stored', async () => {
    const order: string[] = [];
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue({
      id: 'guest_1',
      email: 'guest.abc@guest.launchforma.invalid',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    filingFindUnique.mockResolvedValue(filingOwnedBy('guest_1'));
    userFindUnique.mockImplementation(async (args: { where: { email?: string; id?: string } }) => {
      if (args.where.email) return null;
      return {
        id: 'guest_1',
        email: 'buyer@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        stripeCustomerId: 'cus_g',
        accountStatus: 'GUEST',
      };
    });
    userUpdate.mockImplementation(async () => {
      order.push('email');
      return {};
    });
    filingUpdate.mockImplementation(async () => {
      order.push('filing');
      return {};
    });
    paymentIntentsCreate.mockImplementation(async () => {
      order.push('pi');
      return {
        id: 'pi_1',
        client_secret: 'sec',
        status: 'requires_payment_method',
        amount: ESSENTIAL_FL_LLC_CENTS,
      };
    });

    const res = await POST({
      json: async () => ({ filingId: 'filing_1', email: 'Buyer@Example.com', amountCents: 50 }),
    } as never);
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'guest_1' },
      data: { email: 'buyer@example.com' },
    });
    expect(filingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'filing_1' },
        data: expect.objectContaining({
          optionalDetails: expect.stringContaining('buyer@example.com'),
        }),
      }),
    );
    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: ESSENTIAL_FL_LLC_CENTS,
        receipt_email: 'buyer@example.com',
        metadata: expect.objectContaining({ userId: 'guest_1', filingId: 'filing_1' }),
      }),
      { idempotencyKey: `filing_filing_1_amt_${ESSENTIAL_FL_LLC_CENTS}` },
    );
    expect(order.indexOf('email')).toBeGreaterThan(-1);
    expect(order.indexOf('email')).toBeLessThan(order.indexOf('pi'));
    expect(order.indexOf('filing')).toBeLessThan(order.indexOf('pi'));
  });

  it('denies a guest who does not own the draft', async () => {
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue({
      id: 'guest_1',
      email: 'guest.abc@guest.launchforma.invalid',
      firstName: 'A',
      lastName: 'B',
    });
    filingFindUnique.mockResolvedValue(filingOwnedBy('guest_2'));
    const res = await POST({
      json: async () => ({ filingId: 'filing_1', email: 'buyer@example.com', amountCents: 50 }),
    } as never);
    expect(res.status).toBe(404);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('denies a guest who types an email that already has an account', async () => {
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue({
      id: 'guest_1',
      email: 'guest.abc@guest.launchforma.invalid',
      firstName: 'A',
      lastName: 'B',
    });
    filingFindUnique.mockResolvedValue(filingOwnedBy('guest_1'));
    userFindUnique.mockImplementation(async (args: { where: { email?: string; id?: string } }) => {
      if (args.where.email) {
        return { id: 'victim', accountStatus: 'ACTIVE', email: 'buyer@example.com' };
      }
      return null;
    });
    const res = await POST({
      json: async () => ({ filingId: 'filing_1', email: 'buyer@example.com', amountCents: 50 }),
    } as never);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      code: 'existing_account',
      error: 'This email already has an account. Sign in and we will attach this draft.',
    });
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    const filingWrites = filingUpdate.mock.calls.map((call) => call[0] as { data?: { userId?: string } });
    expect(filingWrites.every((write) => write.data?.userId === undefined)).toBe(true);
  });

  it('returns Spanish copy for the same code when the wizard path is /es', async () => {
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue(null);
    headerGet.mockImplementation((name: string) =>
      name === 'referer' ? 'https://launchforma.com/es/wizard/filing_1/12' : null,
    );
    const res = await POST({ json: async () => ({}) } as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 'start_filing_first',
      error: 'Empieza un trámite primero.',
    });
  });

  it('keeps English when Accept-Language is Spanish and the path is not', async () => {
    auth.mockResolvedValue(null);
    getGuestUser.mockResolvedValue(null);
    headerGet.mockImplementation((name: string) => {
      if (name === 'referer') return 'https://launchforma.com/wizard/filing_1/12';
      if (name === 'accept-language') return 'es-MX,es;q=0.9';
      return null;
    });
    const res = await POST({ json: async () => ({}) } as never);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      code: 'start_filing_first',
      error: 'Please start a filing first.',
    });
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
      expect.objectContaining({ amount: ESSENTIAL_FL_LLC_CENTS }),
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

  it('reprices a stale draft from the catalog and updates the open PaymentIntent', async () => {
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    filingFindUnique.mockResolvedValue({
      ...filingOwnedBy('user_1'),
      serviceTier: 'STANDARD',
      totalCents: STALE_POPULAR_CENTS,
      stateFeeCents: 12_500,
      serviceFeeCents: 15_400,
      addOnsTotalCents: 0,
      checkoutPaymentIntentId: 'pi_stale',
    });
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_stale',
      client_secret: 'sec',
      status: 'requires_payment_method',
      amount: STALE_POPULAR_CENTS,
    });
    paymentIntentsUpdate.mockResolvedValue({
      id: 'pi_stale',
      client_secret: 'sec',
      status: 'requires_payment_method',
      amount: POPULAR_FL_LLC_CENTS,
    });

    const res = await POST({
      json: async () => ({ filingId: 'filing_1', amountCents: STALE_POPULAR_CENTS }),
    } as never);

    expect(res.status).toBe(200);
    expect(POPULAR_FL_LLC_CENTS).toBe(34_900);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(paymentIntentsUpdate).toHaveBeenCalledWith('pi_stale', { amount: POPULAR_FL_LLC_CENTS });
    expect(filingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'filing_1' },
        data: expect.objectContaining({ totalCents: POPULAR_FL_LLC_CENTS }),
      }),
    );
  });

  it('applies a coupon to the repriced catalog total, not the stored total', async () => {
    const couponCents = 5_000;
    const charged = POPULAR_FL_LLC_CENTS - couponCents;
    auth.mockResolvedValue({ user: { id: 'user_1' } });
    filingFindUnique.mockResolvedValue({
      ...filingOwnedBy('user_1'),
      serviceTier: 'STANDARD',
      totalCents: STALE_POPULAR_CENTS,
      stateFeeCents: 12_500,
      serviceFeeCents: 15_400,
      addOnsTotalCents: 0,
      checkoutPaymentIntentId: 'pi_stale',
    });
    couponFindUnique.mockResolvedValue({
      code: 'SAVE50',
      active: true,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      type: 'FIXED',
      value: couponCents,
    });
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_stale',
      client_secret: 'sec',
      status: 'requires_payment_method',
      amount: STALE_POPULAR_CENTS,
    });
    paymentIntentsUpdate.mockResolvedValue({
      id: 'pi_stale',
      client_secret: 'sec',
      status: 'requires_payment_method',
      amount: charged,
    });

    const res = await POST({
      json: async () => ({
        filingId: 'filing_1',
        amountCents: STALE_POPULAR_CENTS,
        couponCode: 'save50',
      }),
    } as never);

    expect(res.status).toBe(200);
    expect(POPULAR_FL_LLC_CENTS).toBe(34_900);
    expect(charged).toBe(29_900);
    expect(charged).not.toBe(STALE_POPULAR_CENTS - couponCents);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(paymentIntentsUpdate).toHaveBeenCalledWith('pi_stale', { amount: charged });
    expect(couponFindUnique).toHaveBeenCalledWith({ where: { code: 'SAVE50' } });
  });
});
