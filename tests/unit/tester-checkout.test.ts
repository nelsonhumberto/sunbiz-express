import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { continueButtonScrollDelta } from '@/lib/start-keyboard';
import { freeTesterCheckout, testerCheckoutAllowed } from '@/lib/tester-checkout';

const QA_EMAIL = 'qa+keeper@launchforma.com';

describe('free tester checkout', () => {
  it('stays a normal card checkout after a qa marker claim', () => {
    expect(
      freeTesterCheckout({
        actorKind: 'user',
        email: 'buyer@example.com',
        paymentIntentId: 'TESTER_BYPASS',
        allowlist: '',
      }),
    ).toBe(false);
    expect(
      freeTesterCheckout({
        actorKind: 'user',
        email: QA_EMAIL,
        paymentIntentId: 'TESTER_BYPASS',
        allowlist: undefined,
      }),
    ).toBe(false);
  });

  it('refuses a qa+ mailbox that is not on the allowlist', () => {
    expect(testerCheckoutAllowed(QA_EMAIL, '')).toBe(false);
    expect(testerCheckoutAllowed(QA_EMAIL, undefined)).toBe(false);
    expect(testerCheckoutAllowed(QA_EMAIL, 'owner@launchforma.com')).toBe(false);
    expect(
      freeTesterCheckout({
        actorKind: 'user',
        email: QA_EMAIL,
        paymentIntentId: 'TESTER_BYPASS',
        allowlist: 'owner@launchforma.com',
      }),
    ).toBe(false);
  });

  it('allows an exact allowlisted email and nobody else', () => {
    const allowlist = ' owner@launchforma.com , QA+Keeper@launchforma.com ';
    expect(testerCheckoutAllowed(QA_EMAIL, allowlist)).toBe(true);
    expect(testerCheckoutAllowed('owner@launchforma.com', allowlist)).toBe(true);
    expect(testerCheckoutAllowed('qa+other@launchforma.com', allowlist)).toBe(false);
    expect(
      freeTesterCheckout({
        actorKind: 'user',
        email: QA_EMAIL,
        paymentIntentId: 'TESTER_BYPASS',
        allowlist,
      }),
    ).toBe(true);
    expect(
      freeTesterCheckout({
        actorKind: 'guest',
        email: QA_EMAIL,
        paymentIntentId: 'TESTER_BYPASS',
        allowlist,
      }),
    ).toBe(false);
    expect(
      freeTesterCheckout({
        actorKind: 'user',
        email: QA_EMAIL,
        paymentIntentId: 'pi_live',
        allowlist,
      }),
    ).toBe(false);
  });

  it('does not read isTester or the QA cookie for the privilege', () => {
    const checkout = readFileSync('lib/tester-checkout.ts', 'utf8');
    expect(checkout).not.toContain('isTester');
    expect(checkout).not.toContain('lf_qa');
    expect(checkout).not.toContain('qa+');
    expect(checkout).toContain('TESTER_CHECKOUT_EMAILS');
    const payments = readFileSync('actions/payments.ts', 'utf8');
    expect(payments).toContain('freeTesterCheckout(');
    expect(payments).toContain('A card payment is required.');
    const step = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');
    expect(step).toContain('if (testerCheckout)');
    expect(step).not.toContain('if (isTester && !isGuest)');
    expect(readFileSync('actions/guest-start.ts', 'utf8')).toContain('clearQaCookie()');
    expect(readFileSync('actions/auth.ts', 'utf8')).toContain('clearQaCookie()');
    const route = readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8');
    const charge = route.slice(route.indexOf('function chargeIsTest'), route.indexOf('async function actorChargeIsTest'));
    expect(charge).not.toContain('qaMarked');
  });
});

describe('mobile continue scroll', () => {
  it('clears a button that sits on or past the visible bottom', () => {
    expect(continueButtonScrollDelta({ buttonBottom: 401.5, visibleHeight: 400 })).toBe(17.5);
    expect(continueButtonScrollDelta({ buttonBottom: 398.5, visibleHeight: 330 })).toBe(84.5);
    expect(continueButtonScrollDelta({ buttonBottom: 300, visibleHeight: 400 })).toBe(0);
  });
});
