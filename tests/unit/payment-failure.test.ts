import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  paymentFailureNote,
  planPaymentFailure,
  planSucceededPayment,
} from '@/lib/payment-failure';

const constructEvent = vi.hoisted(() => vi.fn());
const paymentFindUnique = vi.hoisted(() => vi.fn());
const paymentCreate = vi.hoisted(() => vi.fn());
const paymentUpdate = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const filingUpdate = vi.hoisted(() => vi.fn());
const userFindUnique = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());
const submitFilingToState = vi.hoisted(() => vi.fn());
const notifyAdminOfPaidOrder = vi.hoisted(() => vi.fn());
const capturePurchaseCompletedServer = vi.hoisted(() => vi.fn());
const claimPaidGuestAccount = vi.hoisted(() => vi.fn());
const assertFilingReadyForSubmission = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    charges: { retrieve: vi.fn() },
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      findUnique: paymentFindUnique,
      create: paymentCreate,
      update: paymentUpdate,
    },
    filing: { findUnique: filingFindUnique, update: filingUpdate },
    user: { findUnique: userFindUnique },
  },
}));
vi.mock('@/lib/email', () => ({ sendEmail }));
vi.mock('@/actions/filings', () => ({ submitFilingToState }));
vi.mock('@/lib/paid-order-alert', () => ({ notifyAdminOfPaidOrder }));
vi.mock('@/lib/posthog-server', () => ({ capturePurchaseCompletedServer }));
vi.mock('@/lib/guest-checkout-claim', () => ({ claimPaidGuestAccount }));
vi.mock('@/lib/filing-readiness', () => ({
  assertFilingReadyForSubmission,
}));

import { POST } from '@/app/api/stripe/webhook/route';

const FILING = {
  id: 'fil_1',
  userId: 'usr_1',
  status: 'DRAFT',
  totalCents: 19900,
  stateFeeCents: 12500,
  serviceFeeCents: 7400,
  addOnsTotalCents: 0,
  businessName: 'Harbor LLC',
  optionalDetails: null,
  user: { isTester: false },
};

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi_1',
    amount: 19900,
    amount_received: 0,
    currency: 'usd',
    created: Math.floor(Date.now() / 1000) - 600,
    livemode: true,
    latest_charge: null,
    metadata: { filingId: 'fil_1', isTest: 'false' },
    last_payment_error: { message: 'Your card was declined.' },
    ...overrides,
  };
}

function deliver(type: string, pi: Record<string, unknown>, id = 'evt_1') {
  constructEvent.mockReturnValue({ id, type, data: { object: pi } });
  return POST(
    new Request('https://launchforma.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=abc' },
      body: '{}',
    }) as never,
  );
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  constructEvent.mockReset();
  paymentFindUnique.mockReset();
  paymentCreate.mockReset();
  paymentUpdate.mockReset();
  filingFindUnique.mockReset();
  filingUpdate.mockReset();
  userFindUnique.mockReset();
  sendEmail.mockReset();
  submitFilingToState.mockReset();
  notifyAdminOfPaidOrder.mockReset();
  capturePurchaseCompletedServer.mockReset();
  claimPaidGuestAccount.mockReset();
  assertFilingReadyForSubmission.mockReset();
  paymentCreate.mockResolvedValue({ id: 'pay_1' });
  paymentUpdate.mockResolvedValue({ id: 'pay_1' });
  filingFindUnique.mockResolvedValue(FILING);
  userFindUnique.mockResolvedValue({
    role: 'USER',
    email: 'buyer@example.com',
    accountStatus: 'ACTIVE',
  });
  assertFilingReadyForSubmission.mockResolvedValue({ ok: true });
  submitFilingToState.mockResolvedValue(undefined);
});

describe('payment failure plans', () => {
  it('records once, replays a failed row, and leaves a paid row', () => {
    expect(planPaymentFailure(null)).toBe('create');
    expect(planPaymentFailure(undefined)).toBe('create');
    expect(planPaymentFailure('FAILED')).toBe('replay');
    expect(planPaymentFailure('PENDING')).toBe('mark_failed');
    expect(planPaymentFailure('SUCCEEDED')).toBe('leave_paid');
    expect(planPaymentFailure('REFUNDED')).toBe('leave_paid');
    expect(planSucceededPayment(null)).toBe('create');
    expect(planSucceededPayment('FAILED')).toBe('upgrade');
    expect(planSucceededPayment('PENDING')).toBe('upgrade');
    expect(planSucceededPayment('SUCCEEDED')).toBe('noop');
    expect(planSucceededPayment('REFUNDED')).toBe('noop');
    expect(paymentFailureNote('  Your card was declined.  ')).toBe('Your card was declined.');
    expect(paymentFailureNote('')).toBeNull();
  });
});

describe('POST /api/stripe/webhook payment_intent.payment_failed', () => {
  it('rejects a bad signature before any payment write', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    const res = await POST(
      new Request('https://launchforma.com/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=abc' },
        body: '{}',
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(filingUpdate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('records a failed payment and does not email or change the filing', async () => {
    paymentFindUnique.mockResolvedValue(null);
    const res = await deliver('payment_intent.payment_failed', intent());
    expect(res.status).toBe(200);
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        filingId: 'fil_1',
        stripePaymentIntentId: 'pi_1',
        status: 'FAILED',
        errorMessage: 'Your card was declined.',
        amountCents: 19900,
      }),
    });
    expect(filingUpdate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(submitFilingToState).not.toHaveBeenCalled();
    expect(notifyAdminOfPaidOrder).not.toHaveBeenCalled();
  });

  it('replays a failed event without a second row', async () => {
    paymentFindUnique.mockResolvedValue({
      id: 'pay_1',
      status: 'FAILED',
      filingId: 'fil_1',
      userId: 'usr_1',
    });
    const res = await deliver('payment_intent.payment_failed', intent(), 'evt_replay');
    expect(res.status).toBe(200);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(filingUpdate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not let a late failure overwrite a succeeded payment or a paid filing', async () => {
    paymentFindUnique.mockResolvedValueOnce(null);
    await deliver(
      'payment_intent.succeeded',
      intent({ amount_received: 19900, last_payment_error: null }),
      'evt_ok',
    );
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'SUCCEEDED' }),
    });
    const filingWritesAfterSuccess = filingUpdate.mock.calls.length;

    paymentFindUnique.mockResolvedValue({
      id: 'pay_1',
      status: 'SUCCEEDED',
      filingId: 'fil_1',
      userId: 'usr_1',
    });
    paymentCreate.mockClear();
    paymentUpdate.mockClear();
    sendEmail.mockClear();
    const res = await deliver('payment_intent.payment_failed', intent(), 'evt_late');
    expect(res.status).toBe(200);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(filingUpdate.mock.calls.length).toBe(filingWritesAfterSuccess);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('promotes a failed row when success arrives later', async () => {
    paymentFindUnique.mockResolvedValueOnce(null);
    await deliver('payment_intent.payment_failed', intent(), 'evt_fail');
    expect(paymentCreate).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(filingUpdate).not.toHaveBeenCalled();

    paymentFindUnique.mockResolvedValue({
      id: 'pay_failed',
      status: 'FAILED',
      filingId: 'fil_1',
      userId: 'usr_1',
    });
    paymentCreate.mockClear();
    const res = await deliver(
      'payment_intent.succeeded',
      intent({ amount_received: 19900, last_payment_error: null }),
      'evt_ok',
    );
    expect(res.status).toBe(200);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'pay_failed' },
      data: expect.objectContaining({ status: 'SUCCEEDED', errorMessage: null }),
    });
    expect(filingUpdate).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  it('does not downgrade a filing that is already submitted', async () => {
    filingFindUnique.mockResolvedValue({ ...FILING, status: 'SUBMITTED' });
    paymentFindUnique.mockResolvedValue(null);
    const res = await deliver('payment_intent.payment_failed', intent(), 'evt_after_submit');
    expect(res.status).toBe(200);
    expect(paymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(filingUpdate).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
