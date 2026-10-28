import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  checkoutPaidAlreadySent,
  checkoutPaidStorageKey,
  markCheckoutPaidSent,
  markPurchaseCompletedSent,
  purchaseCompletedAlreadySent,
  purchaseCompletedStorageKey,
} from '@/lib/analytics';

describe('checkout paid events fire once per filing', () => {
  it('stores checkout_paid and purchase_completed separately', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(checkoutPaidAlreadySent('filing_1')).toBe(false);
    markCheckoutPaidSent('filing_1');
    expect(checkoutPaidAlreadySent('filing_1')).toBe(true);
    expect(purchaseCompletedAlreadySent('filing_1')).toBe(false);
    markPurchaseCompletedSent('filing_1');
    expect(store.get(checkoutPaidStorageKey('filing_1'))).toBe('1');
    expect(store.get(purchaseCompletedStorageKey('filing_1'))).toBe('1');
    expect(checkoutPaidAlreadySent('filing_2')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('guards both events in the success tracker and fires checkout_started only from payment', () => {
    const tracker = readFileSync('components/analytics/CheckoutConversionTracker.tsx', 'utf8');
    const paidAt = tracker.indexOf("trackEvent('checkout_paid'");
    const purchaseAt = tracker.indexOf('trackPurchaseCompleted(');
    expect(tracker.indexOf('checkoutPaidAlreadySent')).toBeLessThan(paidAt);
    expect(tracker.indexOf('purchaseCompletedAlreadySent')).toBeLessThan(purchaseAt);
    const payment = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');
    const shell = readFileSync('components/wizard/WizardShell.tsx', 'utf8');
    expect(payment.match(/trackEvent\('checkout_started'/g)).toHaveLength(1);
    expect(shell).not.toContain("trackEvent('checkout_started'");
  });
});
