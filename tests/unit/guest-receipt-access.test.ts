import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkoutSuccessQuery,
  guestMaySeePaidReceipt,
  isCheckoutSuccessPath,
} from '@/lib/guest-receipt-access';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('guest checkout success access', () => {
  it('allows the owning guest on a paid filing in English and Spanish', () => {
    expect(isCheckoutSuccessPath('/checkout/success')).toBe(true);
    expect(isCheckoutSuccessPath('/es/checkout/success')).toBe(true);
    expect(isCheckoutSuccessPath('/dashboard')).toBe(false);
    expect(checkoutSuccessQuery('?filing=filing_1')).toEqual({
      filingId: 'filing_1',
      sessionId: null,
    });
    const owned = {
      cookieUserId: 'guest_1',
      filingUserId: 'guest_1',
      hasSucceededPayment: true,
      checkoutSessionPaid: false,
    };
    expect(guestMaySeePaidReceipt({ ...owned, pathname: '/checkout/success' })).toBe(true);
    expect(guestMaySeePaidReceipt({ ...owned, pathname: '/es/checkout/success' })).toBe(true);
    expect(
      guestMaySeePaidReceipt({
        ...owned,
        pathname: '/checkout/success',
        hasSucceededPayment: false,
        checkoutSessionPaid: true,
      }),
    ).toBe(true);
  });

  it('denies another cookie, no cookie, an unpaid filing, and every other route', () => {
    const base = {
      pathname: '/checkout/success',
      cookieUserId: 'guest_1',
      filingUserId: 'guest_1',
      hasSucceededPayment: true,
      checkoutSessionPaid: false,
    };
    expect(guestMaySeePaidReceipt({ ...base, cookieUserId: null })).toBe(false);
    expect(guestMaySeePaidReceipt({ ...base, cookieUserId: 'guest_2' })).toBe(false);
    expect(guestMaySeePaidReceipt({ ...base, filingUserId: 'account_1' })).toBe(false);
    expect(
      guestMaySeePaidReceipt({
        ...base,
        hasSucceededPayment: false,
        checkoutSessionPaid: false,
      }),
    ).toBe(false);
    expect(guestMaySeePaidReceipt({ ...base, pathname: '/dashboard' })).toBe(false);
    expect(guestMaySeePaidReceipt({ ...base, pathname: '/es/dashboard' })).toBe(false);
  });

  it('renders the receipt and purchase tracker for that guest, and still signs out everyone else', () => {
    const layout = source('app/(app)/layout.tsx');
    const page = source('app/(app)/checkout/success/page.tsx');
    expect(layout.indexOf('guestReceiptViewer')).toBeLessThan(layout.indexOf('redirectToSignIn()'));
    expect(layout).toContain('if (!guestReceipt) return await redirectToSignIn()');
    expect(source('app/(app)/dashboard/page.tsx')).toContain('redirectToSignIn()');
    expect(page.indexOf('guestReceiptViewer')).toBeLessThan(page.indexOf("redirectLocalized('/sign-in')"));
    expect(page).toContain('<CheckoutConversionTracker');
    expect(page).toContain("t('signInToSeeFiling')");
    expect(en.checkoutSuccess.signInToSeeFiling).toBe('Sign in to see your filing');
    expect(es.checkoutSuccess.signInToSeeFiling).toBe('Entra para ver tu trámite');
    expect(es.checkoutSuccess.signInToSeeFiling).not.toMatch(/\u2014|\u2013/);
    expect(es.checkoutSuccess.signInToSeeFiling).not.toMatch(/\b(listo|lista|bienvenido|bienvenida)\b/i);
  });
});
