import { afterEach, describe, expect, it, vi } from 'vitest';
import { purchaseConversionStorageKey } from '@/lib/ads-conversions';
import { trackGooglePurchase } from '@/lib/analytics';
import {
  CHECKOUT_PAYMENT_POLL_INTERVAL_MS,
  CHECKOUT_PAYMENT_POLL_TIMEOUT_MS,
  onCheckoutPaymentPaid,
  watchCheckoutPayment,
  type CheckoutPaymentPollResult,
} from '@/lib/checkout-payment-watch';

const envKeys = [
  'NEXT_PUBLIC_GOOGLE_ADS_ID',
  'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL',
  'NEXT_PUBLIC_VERCEL_ENV',
] as const;

describe('checkout payment watch', () => {
  const previous: Record<string, string | undefined> = {};
  const store = new Map<string, string>();

  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  function install() {
    for (const key of envKeys) previous[key] = process.env[key];
    process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = 'AW-123';
    process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL = 'purchaseLabel';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production';
    const gtag = vi.fn();
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('navigator', { globalPrivacyControl: false });
    vi.stubGlobal('window', {
      gtag,
      location: { search: '' },
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    return { gtag };
  }

  function paid(overrides: Partial<Extract<CheckoutPaymentPollResult, { status: 'paid' }>> = {}) {
    return {
      status: 'paid' as const,
      transactionId: 'filing_1',
      amountCents: 19900,
      currency: 'usd',
      isTest: false,
      ...overrides,
    };
  }

  it('fires the purchase once when a pending payment becomes paid', async () => {
    const { gtag } = install();
    const clock = { t: 0 };
    let checks = 0;
    let refreshes = 0;
    const result = await watchCheckoutPayment({
      check: async () => {
        checks += 1;
        return checks < 3 ? { status: 'pending' } : paid();
      },
      onPaid: (row) => {
        onCheckoutPaymentPaid(row, { isTester: false, email: 'buyer@example.com' }, () => {
          refreshes += 1;
        });
      },
      now: () => clock.t,
      wait: async (ms) => {
        expect(ms).toBe(CHECKOUT_PAYMENT_POLL_INTERVAL_MS);
        expect(ms).toBeGreaterThanOrEqual(2_000);
        expect(ms).toBeLessThanOrEqual(3_000);
        clock.t += ms;
      },
    });

    expect(result).toBe('paid');
    expect(refreshes).toBe(1);
    const purchases = gtag.mock.calls.filter((call) => call[1] === 'purchase');
    const conversions = gtag.mock.calls.filter((call) => call[1] === 'conversion');
    expect(purchases).toHaveLength(1);
    expect(conversions).toHaveLength(1);
    expect(conversions[0]?.[2]).toMatchObject({
      transaction_id: 'filing_1',
      value: 199,
      currency: 'USD',
    });

    trackGooglePurchase({ transactionId: 'filing_1', valueCents: 19900, currency: 'usd' });
    expect(gtag.mock.calls.filter((call) => call[1] === 'purchase')).toHaveLength(1);
    expect(store.get(purchaseConversionStorageKey('filing_1'))).toBe('1');
  });

  it('does not fire when the payment is still pending past the timeout', async () => {
    const { gtag } = install();
    const clock = { t: 0 };
    let fired = false;
    const result = await watchCheckoutPayment({
      check: async () => ({ status: 'pending' }),
      onPaid: () => {
        fired = true;
      },
      now: () => clock.t,
      wait: async (ms) => {
        clock.t += ms;
      },
    });

    expect(result).toBe('timeout');
    expect(fired).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
    expect(clock.t).toBeLessThanOrEqual(CHECKOUT_PAYMENT_POLL_TIMEOUT_MS);
    expect(clock.t).toBeGreaterThan(50_000);
  });

  it('does not fire a purchase for a tester', async () => {
    const { gtag } = install();
    await watchCheckoutPayment({
      check: async () => paid({ transactionId: 'filing_qa' }),
      onPaid: (row) => {
        onCheckoutPaymentPaid(
          row,
          { isTester: true, email: 'qa+buyer@launchforma.com' },
          () => undefined,
        );
      },
      now: () => 0,
      wait: async () => undefined,
    });

    expect(gtag).not.toHaveBeenCalled();
    expect(store.has(purchaseConversionStorageKey('filing_qa'))).toBe(false);
  });
});
