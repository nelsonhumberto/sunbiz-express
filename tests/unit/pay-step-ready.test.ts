import { describe, expect, it } from 'vitest';
import { cardFormSubmittable } from '@/lib/card-form-ready';
import { paymentCreateFailureLog, safePaymentErrorReason } from '@/lib/payment-intent-log';
import { paymentCreateShouldRetry, postPaymentIntent } from '@/lib/payment-create-retry';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

describe('pay step card readiness', () => {
  it('stays closed until Stripe has mounted a complete card field', () => {
    expect(cardFormSubmittable({ testerCheckout: false, elementReady: false, complete: false })).toBe(
      false,
    );
    expect(cardFormSubmittable({ testerCheckout: false, elementReady: true, complete: false })).toBe(
      false,
    );
    expect(cardFormSubmittable({ testerCheckout: false, elementReady: true, complete: true })).toBe(
      true,
    );
    expect(cardFormSubmittable({ testerCheckout: true, elementReady: false, complete: false })).toBe(
      true,
    );
    expect(en.wizard.cardFormLoading).toMatch(/try again/i);
    expect(es.wizard.cardFormLoading).toMatch(/inténtalo/i);
    expect(es.wizard.cardFormIncomplete).not.toMatch(/\b(Enter|postal code)\b/);
    expect(es.wizard.pageTitle).toBe('Tu trámite');
    expect(en.wizard.pageTitle).toBe('Your filing');
  });
});

describe('payment create failure', () => {
  it('logs a filing id and strips email and secret keys', () => {
    expect(
      paymentCreateFailureLog({
        filingId: 'fil_1',
        reason: safePaymentErrorReason(new Error('customer buyer@example.com sk_live_abc123')),
      }),
    ).toEqual({
      area: 'stripe',
      tag: 'create_failed',
      entityId: 'fil_1',
      reason: 'Error: customer [redacted] [redacted]',
    });
    expect(paymentCreateFailureLog({ reason: 'no_guest_cookie' }).entityId).toBeUndefined();
  });

  it('retries one unknown or 5xx create and reuses the same filing and intent', async () => {
    expect(
      paymentCreateShouldRetry({ attempt: 0, status: 500, code: 'create_failed' }),
    ).toBe(true);
    expect(paymentCreateShouldRetry({ attempt: 1, status: 500, code: 'create_failed' })).toBe(
      false,
    );
    expect(paymentCreateShouldRetry({ attempt: 0, status: 401, code: 'start_filing_first' })).toBe(
      false,
    );
    expect(paymentCreateShouldRetry({ attempt: 0, status: 200, hasClientSecret: true })).toBe(
      false,
    );
    expect(paymentCreateShouldRetry({ attempt: 0, status: 0, networkError: true })).toBe(true);

    const calls: Record<string, unknown>[] = [];
    const result = await postPaymentIntent(async (body) => {
      calls.push(body);
      if (calls.length === 1) {
        return {
          status: 500,
          json: { code: 'create_failed', error: 'Could not create payment.', paymentIntentId: 'pi_1' },
        };
      }
      return { status: 200, json: { clientSecret: 'sec_1', paymentIntentId: 'pi_1' } };
    }, { filingId: 'fil_1', amountCents: 19900 });

    expect(calls).toEqual([
      { filingId: 'fil_1', amountCents: 19900 },
      { filingId: 'fil_1', amountCents: 19900, paymentIntentId: 'pi_1' },
    ]);
    expect(result.json).toMatchObject({ clientSecret: 'sec_1', paymentIntentId: 'pi_1' });
  });
});
