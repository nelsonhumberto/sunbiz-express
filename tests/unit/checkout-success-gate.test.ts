import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { purchaseCompletedEventProperties } from '@/lib/analytics';
import {
  checkoutFilingCandidates,
  gateCheckoutSuccess,
  isPaidCheckoutSession,
  readQueryParam,
  toCheckoutSessionSnapshot,
  verifyPaidCheckoutSession,
  type CheckoutOwnerContext,
  type CheckoutSessionSnapshot,
} from '@/lib/checkout-session-verification';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const owner: CheckoutOwnerContext = {
  userId: 'user_1',
  email: 'Buyer@example.com',
  stripeCustomerId: 'cus_1',
  requestedFilingId: 'filing_1',
  ownedFilingIds: ['filing_1'],
};

function paidSession(overrides: CheckoutSessionSnapshot = {}): CheckoutSessionSnapshot {
  return {
    id: 'cs_test_123',
    payment_status: 'paid',
    status: 'complete',
    amount_total: 14900,
    currency: 'usd',
    metadata: { userId: 'user_1', filingId: 'filing_1' },
    ...overrides,
  };
}

describe('isPaidCheckoutSession', () => {
  it('accepts payment_status paid', () => {
    expect(isPaidCheckoutSession({ payment_status: 'paid', status: 'open' })).toBe(true);
  });

  it('accepts status complete with payment_status paid', () => {
    expect(isPaidCheckoutSession({ payment_status: 'paid', status: 'complete' })).toBe(true);
  });

  it('rejects a complete session that is still unpaid', () => {
    expect(isPaidCheckoutSession({ payment_status: 'unpaid', status: 'complete' })).toBe(false);
    expect(isPaidCheckoutSession({ payment_status: 'no_payment_required', status: 'complete' })).toBe(
      false,
    );
  });
});

describe('gateCheckoutSuccess', () => {
  it('does not verify when session_id is missing', () => {
    expect(
      gateCheckoutSuccess({
        sessionId: null,
        session: paidSession(),
        owner,
      }),
    ).toEqual({ status: 'confirming' });
    expect(readQueryParam('   ')).toBeNull();
    expect(readQueryParam(['cs_test_123'])).toBe('cs_test_123');
  });

  it('does not verify an invalid or unpaid session', () => {
    expect(
      gateCheckoutSuccess({ sessionId: 'cs_missing', session: null, owner }),
    ).toEqual({ status: 'confirming' });
    expect(
      gateCheckoutSuccess({
        sessionId: 'cs_test_123',
        session: paidSession({ payment_status: 'unpaid' }),
        owner,
      }),
    ).toEqual({ status: 'confirming' });
    expect(
      gateCheckoutSuccess({
        sessionId: 'cs_other',
        session: paidSession({ id: 'cs_test_123' }),
        owner,
      }),
    ).toEqual({ status: 'confirming' });
  });

  it('verifies a paid session that belongs to the current user and filing', () => {
    expect(
      gateCheckoutSuccess({
        sessionId: 'cs_test_123',
        session: paidSession(),
        owner,
      }),
    ).toEqual({
      status: 'paid',
      amountCents: 14900,
      currency: 'USD',
      filingId: 'filing_1',
    });
  });

  it('keeps a user and filing match when the checkout email differs', () => {
    expect(
      verifyPaidCheckoutSession(
        paidSession({
          customer: 'cus_new',
          customer_email: 'other@example.com',
        }),
        owner,
      ),
    ).toMatchObject({ filingId: 'filing_1', amountCents: 14900, currency: 'USD' });
  });

  it('rejects a paid session for another user or filing', () => {
    expect(
      verifyPaidCheckoutSession(paidSession({ metadata: { userId: 'user_2', filingId: 'filing_1' } }), owner),
    ).toBeNull();
    expect(
      verifyPaidCheckoutSession(paidSession({ metadata: { userId: 'user_1', filingId: 'filing_9' } }), owner),
    ).toBeNull();
    expect(
      verifyPaidCheckoutSession(
        paidSession({ metadata: {}, customer: 'cus_other', customer_email: 'other@example.com' }),
        owner,
      ),
    ).toBeNull();
  });

  it('matches ownership from filing id, client reference, customer, or email', () => {
    expect(
      verifyPaidCheckoutSession(
        paidSession({ metadata: { filingId: 'filing_1' }, customer_email: null }),
        { ...owner, email: null, stripeCustomerId: null },
      )?.filingId,
    ).toBe('filing_1');

    expect(
      verifyPaidCheckoutSession(
        paidSession({
          metadata: {},
          client_reference_id: 'filing_1',
          customer_email: null,
        }),
        { ...owner, email: null, stripeCustomerId: null },
      )?.filingId,
    ).toBe('filing_1');

    expect(
      verifyPaidCheckoutSession(
        paidSession({ metadata: {}, customer: { id: 'cus_1' }, customer_email: null }),
        { ...owner, requestedFilingId: null, ownedFilingIds: [] },
      ),
    ).toMatchObject({ filingId: null, amountCents: 14900, currency: 'USD' });

    expect(
      verifyPaidCheckoutSession(
        paidSession({ metadata: {}, customer_email: 'buyer@example.com' }),
        { ...owner, stripeCustomerId: null },
      )?.filingId,
    ).toBe('filing_1');
  });

  it('does not treat an unowned session with no owner signals as paid for this user', () => {
    expect(
      verifyPaidCheckoutSession(
        paidSession({ metadata: {}, customer: null, customer_email: null, client_reference_id: 'order_9' }),
        owner,
      ),
    ).toBeNull();
  });

  it('reads amount and currency from the Checkout Session snapshot', () => {
    const snapshot = toCheckoutSessionSnapshot({
      id: 'cs_test_123',
      payment_status: 'paid',
      status: 'complete',
      amount_total: 22400,
      currency: 'usd',
      customer_details: { email: 'buyer@example.com' },
      customer_email: 'old@example.com',
      metadata: { userId: 'user_1' },
    });
    expect(snapshot.customer_email).toBe('buyer@example.com');
    expect(snapshot.amount_total).toBe(22400);
    expect(checkoutFilingCandidates(snapshot, 'filing_1')).toEqual(['filing_1']);
  });
});

describe('purchase_completed event properties', () => {
  it('passes the verified amount and currency through the existing capture shape', () => {
    expect(
      purchaseCompletedEventProperties({
        filingId: 'filing_1',
        amountCents: 14900,
        currency: 'USD',
        state: 'FL',
        entityType: 'LLC',
        tier: 'STANDARD',
      }),
    ).toEqual({
      filing_id: 'filing_1',
      order_id: 'filing_1',
      revenue_cents: 14900,
      value: 149,
      currency: 'USD',
      state: 'FL',
      entity_type: 'LLC',
      tier: 'STANDARD',
    });
  });

  it('omits amount and currency when the session did not include them', () => {
    expect(
      purchaseCompletedEventProperties({
        filingId: 'filing_1',
        amountCents: null,
        currency: null,
      }),
    ).toEqual({
      filing_id: 'filing_1',
      order_id: 'filing_1',
    });
  });

  it('keeps the purchase_completed capture call behind the paid gate', () => {
    const analytics = readFileSync(path.join(process.cwd(), 'lib/analytics.ts'), 'utf8');
    const tracker = readFileSync(
      path.join(process.cwd(), 'components/analytics/CheckoutConversionTracker.tsx'),
      'utf8',
    );
    const page = readFileSync(path.join(process.cwd(), 'app/(app)/checkout/success/page.tsx'), 'utf8');

    expect(analytics).toContain("trackEvent('purchase_completed'");
    expect(tracker).toContain('trackPurchaseCompleted');
    expect(tracker).toContain('purchaseCompletedEventProperties');
    expect(page).toContain('retrieveCheckoutSession');
    expect(page).toContain('gateCheckoutSuccess');

    const confirming = page.indexOf("t('confirmingTitle')");
    const trackerMount = page.indexOf('<CheckoutConversionTracker');
    expect(confirming).toBeGreaterThan(-1);
    expect(trackerMount).toBeGreaterThan(confirming);
    expect(page).toContain('href="/dashboard"');
  });
});

describe('checkout success copy', () => {
  it('confirms the order in English and Spanish without em dashes', () => {
    for (const messages of [en, es]) {
      const copy = messages.checkoutSuccess;
      for (const key of ['confirmingTitle', 'confirmingBody', 'confirmedTitle', 'confirmedBody', 'goDashboard'] as const) {
        expect(copy[key], key).not.toMatch(/—|–/);
        expect(copy[key].length).toBeGreaterThan(0);
      }
    }
    expect(en.checkoutSuccess.confirmingTitle).toMatch(/confirming your order/i);
    expect(es.checkoutSuccess.confirmingTitle).toMatch(/confirmando tu pedido/i);
    expect(en.checkoutSuccess.goDashboard).toMatch(/dashboard/i);
    expect(es.checkoutSuccess.goDashboard).toMatch(/panel/i);
  });
});
