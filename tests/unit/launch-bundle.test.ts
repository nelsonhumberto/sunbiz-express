import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { filingCheckoutEmailDetails } from '@/lib/guest-checkout';
import { buildLlmsFullTxt, buildLlmsTxt } from '@/lib/llms';
import {
  LAUNCH_BUNDLE_CAP,
  LAUNCH_BUNDLE_PRICE_CENTS,
  LAUNCH_BUNDLE_REFERRAL_COMMISSION_CENTS,
  countsTowardLaunchBundleCap,
  isLaunchBundlePath,
  launchBundleCostBreakdown,
  launchBundleOptionalDetails,
  launchBundlePaymentAllowed,
  mergeReferralRef,
  normalizeReferralRef,
  paidLaunchBundleSlots,
  paidLaunchBundleWhere,
  type LaunchBundlePaymentRow,
} from '@/lib/launch-bundle';
import { launchBundleCostBreakdown as quoteFromPricing, tierPackagePriceCents } from '@/lib/pricing';

function paidRow(filingId: string, overrides: Partial<LaunchBundlePaymentRow> = {}): LaunchBundlePaymentRow {
  return {
    filingId,
    status: 'SUCCEEDED',
    isTest: false,
    filingIsTest: false,
    amountCents: LAUNCH_BUNDLE_PRICE_CENTS,
    ...overrides,
  };
}

describe('launch bundle price', () => {
  it('charges $299 with the Florida state filing fee included', () => {
    expect(LAUNCH_BUNDLE_PRICE_CENTS).toBe(29_900);
    expect(LAUNCH_BUNDLE_REFERRAL_COMMISSION_CENTS).toBe(2_000);
    expect(LAUNCH_BUNDLE_CAP).toBe(10);

    const quote = launchBundleCostBreakdown();
    expect(quote).toEqual(quoteFromPricing());
    expect(quote.totalCents).toBe(29_900);
    expect(quote.lines.reduce((sum, line) => sum + line.cents, 0)).toBe(29_900);
    expect(quote.governmentRemittanceCents).toBe(12_500);

    const described = quote.lines.map((line) => `${line.label} ${line.detail ?? ''}`).join(' ');
    expect(described).toContain('Essential package');
    expect(described).toContain('EIN application and filing');
    expect(described).toContain('single-member Operating Agreement');
    expect(described).toContain('Florida state filing fee included');

    // Other catalog prices stay put.
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(14_900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(27_900);
    expect(tierPackagePriceCents('PREMIUM', 'LLC', 'FL')).toBe(44_900);
  });
});

describe('launch bundle cap', () => {
  it('refuses the 11th paid order and ignores isTest filings and payments', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) => paidRow(`paid-${index}`)),
      paidRow('test-payment', { isTest: true }),
      paidRow('test-filing', { filingIsTest: true }),
      paidRow('pending', { status: 'PENDING' }),
      paidRow('other-amount', { amountCents: 14_900 }),
      paidRow('paid-0', { amountCents: LAUNCH_BUNDLE_PRICE_CENTS }),
    ];

    expect(rows.filter(countsTowardLaunchBundleCap)).toHaveLength(11);
    expect(paidLaunchBundleSlots(rows)).toBe(10);
    expect(launchBundlePaymentAllowed(paidLaunchBundleSlots(rows))).toBe(false);
    expect(launchBundlePaymentAllowed(9)).toBe(true);
    expect(launchBundlePaymentAllowed(10)).toBe(false);

    expect(paidLaunchBundleWhere.isTest).toBe(false);
    expect(paidLaunchBundleWhere.payments.some.isTest).toBe(false);
    expect(paidLaunchBundleWhere.payments.some.status).toBe('SUCCEEDED');
    expect(paidLaunchBundleWhere.payments.some.amountCents).toBe(29_900);
  });
});

describe('launch bundle discovery', () => {
  it('marks the landing page noindex, nofollow', () => {
    const source = readFileSync('app/(marketing)/launch-bundle/page.tsx', 'utf8');
    expect(source).toContain('noindex, nofollow');
    expect(isLaunchBundlePath('/launch-bundle')).toBe(true);
    expect(isLaunchBundlePath('/es/launch-bundle')).toBe(true);
    expect(isLaunchBundlePath('/start')).toBe(false);
    expect(isLaunchBundlePath('/pricing')).toBe(false);
  });

  it('stays out of the sitemap and llms.txt', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes('launch-bundle'))).toBe(false);
    expect(buildLlmsTxt()).not.toContain('launch-bundle');
    expect(buildLlmsFullTxt()).not.toContain('launch-bundle');
  });
});

describe('launch bundle referral ref', () => {
  it('stores a partner code and the commission constant without paying it out', () => {
    expect(normalizeReferralRef(' partner_1 ')).toBe('partner_1');
    expect(normalizeReferralRef('bad ref')).toBeNull();
    expect(normalizeReferralRef('')).toBeNull();

    const stored = JSON.parse(launchBundleOptionalDetails('partner_1')) as {
      launchBundle: boolean;
      referralRef: string;
      referralCommissionCents: number;
    };
    expect(stored).toEqual({
      launchBundle: true,
      referralRef: 'partner_1',
      referralCommissionCents: 2_000,
    });

    const kept = JSON.parse(mergeReferralRef(launchBundleOptionalDetails('first'), 'second')) as {
      referralRef: string;
    };
    expect(kept.referralRef).toBe('first');

    const withEmail = filingCheckoutEmailDetails(
      JSON.parse(launchBundleOptionalDetails('partner_1')) as Record<string, unknown>,
      'buyer@example.com',
    );
    expect(withEmail).toMatchObject({
      launchBundle: true,
      referralRef: 'partner_1',
      referralCommissionCents: 2_000,
      checkoutEmail: 'buyer@example.com',
      typedGuestEmail: 'buyer@example.com',
    });
  });
});

describe('launch bundle guest checkout', () => {
  it('uses the guest pay path and still sends the set-password email', () => {
    const payments = readFileSync('actions/payments.ts', 'utf8');
    const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8');
    const route = readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8');
    const step = readFileSync('components/wizard/steps/Step12Payment.tsx', 'utf8');

    expect(route).toContain('createGuestFormationPaymentIntent');
    expect(route).toContain('priceOwnedCharge');
    expect(route).toContain('isLaunchBundleFiling');
    expect(step).toContain('guestPayEmailRequired');
    expect(step).not.toContain('GuestCheckoutAccount');
    expect(step).not.toContain('nextDisabled={isGuest}');

    const claimAt = payments.indexOf('claimPaidGuestAccount');
    expect(claimAt).toBeGreaterThan(payments.indexOf('LAUNCH_BUNDLE_PRICE_CENTS'));
    expect(payments).toContain("if (actor.kind === 'guest')");
    expect(payments).not.toContain('guest && !launchBundle');
    expect(webhook).toContain('claimPaidGuestAccount');
    expect(webhook).not.toContain('purpose !== \'launch_bundle\'');
    expect(readFileSync('lib/guest-checkout-claim.ts', 'utf8')).toContain("type: 'GUEST_SET_PASSWORD'");
  });
});
