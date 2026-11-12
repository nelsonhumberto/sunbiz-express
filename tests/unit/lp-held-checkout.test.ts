import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeCost } from '@/lib/pricing';
import { CHECKOUT_ACCOUNT_REQUIRED } from '@/lib/guest-identity';

const auth = vi.hoisted(() => vi.fn());
const signIn = vi.hoisted(() => vi.fn());
const getGuestUser = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const paymentCreate = vi.hoisted(() => vi.fn(async () => ({ id: 'pay_1' })));
const userFindUnique = vi.hoisted(() => vi.fn());
const managerCount = vi.hoisted(() => vi.fn(async () => 1));
const paymentIntentsRetrieve = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn(async () => ({ id: 'mail_1' })));
const submitFilingToState = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
  headers: () => ({ get: () => null }),
}));
vi.mock('@/lib/auth', () => ({ auth, signIn }));
vi.mock('@/lib/guest', () => ({
  getGuestUser,
  getWizardActor: async (userId?: string | null, email?: string | null) => {
    if (userId) return { kind: 'user' as const, id: userId, email: email ?? null };
    const guest = await getGuestUser();
    if (!guest) return null;
    return {
      kind: 'guest' as const,
      id: guest.id,
      email: guest.email,
      firstName: guest.firstName,
      lastName: guest.lastName,
    };
  },
  GUEST_COOKIE: 'LF_GUEST_TOKEN',
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    filing: { findUnique: filingFindUnique, update: filingUpdate },
    payment: { create: paymentCreate },
    user: { findUnique: userFindUnique },
    managerMember: { count: managerCount },
    coupon: { update: vi.fn() },
  },
}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ paymentIntents: { retrieve: paymentIntentsRetrieve } }),
}));
vi.mock('@/lib/email', () => ({ sendEmail }));
vi.mock('@/actions/filings', () => ({ submitFilingToState }));
vi.mock('@/lib/guest-checkout-claim', () => ({
  claimPaidGuestAccount: vi.fn(async () => ({ claimed: false })),
}));
vi.mock('@/lib/posthog-server', () => ({ capturePurchaseCompletedServer: vi.fn(async () => {}) }));
vi.mock('@/lib/utm-attribution', () => ({
  ensureFilingTouchUtm: vi.fn(async () => {}),
  ensureUserFirstTouchUtm: vi.fn(async () => {}),
}));
vi.mock('@/lib/paid-order-alert', () => ({ notifyAdminOfPaidOrder: vi.fn(async () => {}) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { processCheckout } from '@/actions/payments';

const PLACEHOLDER = 'guest.abc@guest.launchforma.invalid';
const TYPED = 'buyer@example.com';

function landingFiling() {
  return {
    id: 'filing_1',
    userId: 'guest_1',
    status: 'DRAFT',
    state: 'FL',
    entityType: 'LLC',
    serviceTier: 'BASIC',
    locale: 'en',
    entryPath: '/lp/florida-llc',
    businessName: 'Sol Norte LLC',
    principalAddress: JSON.stringify({ street1: '1 Main', city: 'Miami', state: 'FL', zip: '33101' }),
    registeredAgent: JSON.stringify({ useOurService: true, name: 'LaunchForma', street1: '2 Agent' }),
    incorporatorSignature: 'Ada Lovelace',
    correspondenceContact: JSON.stringify({ email: PLACEHOLDER }),
    optionalDetails: JSON.stringify({
      floridaLlcPreselected: true,
      checkoutEmail: TYPED,
      typedGuestEmail: TYPED,
    }),
    contactPhone: null,
    filingAdditionalServices: [],
    einApplication: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
  };
}

describe('processCheckout for a landing guest whose email already exists', () => {
  const total = computeCost({
    entityType: 'LLC',
    tier: 'BASIC',
    addOnSlugs: [],
    state: 'FL',
  }).totalCents;

  beforeEach(() => {
    auth.mockReset();
    auth.mockResolvedValue(null);
    signIn.mockReset();
    getGuestUser.mockReset();
    filingFindUnique.mockReset();
    filingUpdate.mockClear();
    paymentCreate.mockClear();
    sendEmail.mockClear();
    submitFilingToState.mockClear();
    userFindUnique.mockReset();
    paymentIntentsRetrieve.mockReset();
    getGuestUser.mockResolvedValue({
      id: 'guest_1',
      email: PLACEHOLDER,
      firstName: '',
      lastName: '',
      isTester: false,
    });
    userFindUnique.mockResolvedValue({
      id: 'guest_1',
      email: PLACEHOLDER,
      isTester: false,
      role: 'USER',
      accountStatus: 'GUEST',
    });
    paymentIntentsRetrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      amount: total,
      amount_received: total,
      currency: 'usd',
      livemode: false,
      created: 1,
      metadata: { filingId: 'filing_1', userId: 'guest_1' },
      payment_method: { id: 'pm_1', card: { last4: '4242', brand: 'visa' }, billing_details: { name: 'Ada' } },
    });
  });

  it('charges the guest filing and emails the typed address', async () => {
    filingFindUnique.mockResolvedValue(landingFiling());
    const result = await processCheckout({
      filingId: 'filing_1',
      paymentIntentId: 'pi_1',
      autoRenewRa: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.error).not.toBe(CHECKOUT_ACCOUNT_REQUIRED);
    expect(signIn).not.toHaveBeenCalled();
    expect(paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'guest_1', filingId: 'filing_1' }),
      }),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PAYMENT_CONFIRMATION', to: TYPED }),
    );
    const filingWrites = filingUpdate.mock.calls.map(
      (call) => (call as unknown as [{ data?: { userId?: string } }])[0],
    );
    expect(filingWrites.every((write) => write.data?.userId === undefined)).toBe(true);
  });

  it('still refuses /start when the guest mailbox is a placeholder', async () => {
    filingFindUnique.mockResolvedValue({
      ...landingFiling(),
      entryPath: '/start',
      optionalDetails: JSON.stringify({ checkoutEmail: TYPED, typedGuestEmail: TYPED }),
    });
    const result = await processCheckout({
      filingId: 'filing_1',
      paymentIntentId: 'pi_1',
    });
    expect(result).toEqual({ error: CHECKOUT_ACCOUNT_REQUIRED });
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
