import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { TIER_BY_SLUG } from '@/lib/pricing';
import { middleware } from '../../middleware';
import {
  AFFILIATE_COMMISSION_CENTS,
  AFFILIATE_COOKIE,
  AFFILIATE_MAX_AGE_SECONDS,
  affiliateEnabled,
  commissionCentsForProduct,
  commissionDecision,
  commissionStatusAfterReversal,
  persistedReferral,
  referralCookieValue,
  referralLocalStorageValue,
  resolveReferral,
  shouldReverseCommission,
  stripeReferralMetadata,
  type AffiliatePartner,
} from '@/lib/affiliate';

const NOW = Date.parse('2026-10-25T16:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const ADA: AffiliatePartner = {
  id: 'p_ada',
  code: 'ADA',
  email: 'ada@partners.test',
  status: 'ACTIVE',
  stripePromotionCodeId: 'promo_ada',
};
const BEE: AffiliatePartner = {
  id: 'p_bee',
  code: 'BEE',
  email: 'bee@partners.test',
  status: 'ACTIVE',
  stripePromotionCodeId: 'promo_bee',
};
const PAUSED: AffiliatePartner = {
  id: 'p_old',
  code: 'OLD',
  email: 'old@partners.test',
  status: 'PAUSED',
  stripePromotionCodeId: 'promo_old',
};

const PARTNERS = [ADA, BEE, PAUSED];

function click(code: string, capturedAtMs: number) {
  return { code, capturedAtMs };
}

describe('affiliate commission by product', () => {
  it('pays the approved flat amount and $0 for add-ons', () => {
    expect(AFFILIATE_COMMISSION_CENTS.BASIC).toBe(1_000);
    expect(AFFILIATE_COMMISSION_CENTS.STANDARD).toBe(5_000);
    expect(AFFILIATE_COMMISSION_CENTS.PREMIUM).toBe(10_000);
    expect(AFFILIATE_COMMISSION_CENTS['launch-bundle']).toBe(2_000);
    expect(AFFILIATE_COMMISSION_CENTS.llc_reinstatement).toBe(4_000);

    for (const slug of Object.keys(TIER_BY_SLUG)) {
      expect(commissionCentsForProduct(slug)).toBeGreaterThan(0);
    }
    expect(commissionCentsForProduct('BASIC')).toBe(1_000);
    expect(commissionCentsForProduct('STANDARD')).toBe(5_000);
    expect(commissionCentsForProduct('PREMIUM')).toBe(10_000);
    expect(commissionCentsForProduct('launch-bundle')).toBe(2_000);
    expect(commissionCentsForProduct('llc_reinstatement')).toBe(4_000);

    for (const addon of ['ein', 'operating_agreement_single', 'operating_agreement_multi', 'domain_com', 'cert_status', 'cert_copy', 'annual_report']) {
      expect(commissionCentsForProduct(addon), addon).toBe(0);
    }

    expect(
      commissionDecision({
        enabled: true,
        attributed: true,
        productSlug: 'ein',
        buyerEmail: 'buyer@example.com',
        partnerEmail: 'ada@partners.test',
      }),
    ).toEqual({ commissionCents: 0, commissionStatus: null });
    expect(
      commissionDecision({
        enabled: true,
        attributed: true,
        productSlug: 'PREMIUM',
        buyerEmail: 'buyer@example.com',
        partnerEmail: 'ada@partners.test',
      }),
    ).toEqual({ commissionCents: 10_000, commissionStatus: 'PENDING' });
  });

  it('sets no commission on a self-referral', () => {
    expect(
      commissionDecision({
        enabled: true,
        attributed: true,
        productSlug: 'BASIC',
        buyerEmail: 'Ada@Partners.test',
        partnerEmail: 'ada@partners.test',
      }),
    ).toEqual({ commissionCents: 0, commissionStatus: null });
  });
});

describe('affiliate attribution', () => {
  it('lets a Stripe promotion code beat the cookie', () => {
    const choice = resolveReferral({
      enabled: true,
      nowMs: NOW,
      optedOut: false,
      cookie: click('ADA', NOW - DAY),
      stored: click('ADA', NOW - 1000),
      checkoutCode: 'promo_bee',
      partners: PARTNERS,
    });
    expect(choice).toMatchObject({
      code: 'BEE',
      partnerId: 'p_bee',
      source: 'PROMO_CODE',
    });
  });

  it('keeps the newest click inside the window', () => {
    const choice = resolveReferral({
      enabled: true,
      nowMs: NOW,
      optedOut: false,
      cookie: click('ada', NOW - 10 * DAY),
      stored: click('bee', NOW - DAY),
      checkoutCode: null,
      partners: PARTNERS,
    });
    expect(choice).toMatchObject({ code: 'BEE', source: 'LINK', capturedAtMs: NOW - DAY });
  });

  it('drops a click once it is older than 30 days', () => {
    const windowMs = AFFILIATE_MAX_AGE_SECONDS * 1000;
    const fresh = resolveReferral({
      enabled: true,
      nowMs: NOW,
      optedOut: false,
      cookie: click('ADA', NOW - windowMs),
      stored: null,
      checkoutCode: null,
      partners: PARTNERS,
    });
    expect(fresh?.code).toBe('ADA');

    const expired = resolveReferral({
      enabled: true,
      nowMs: NOW,
      optedOut: false,
      cookie: click('ADA', NOW - windowMs - 1),
      stored: click('BEE', NOW - windowMs - DAY),
      checkoutCode: null,
      partners: PARTNERS,
    });
    expect(expired).toBeNull();
  });

  it('ignores a paused or removed code', () => {
    const choice = resolveReferral({
      enabled: true,
      nowMs: NOW,
      optedOut: false,
      cookie: click('OLD', NOW - DAY),
      stored: null,
      checkoutCode: 'promo_old',
      partners: PARTNERS,
    });
    expect(choice).toBeNull();
  });

  it('does nothing when the flag is off', () => {
    expect(affiliateEnabled({})).toBe(false);
    expect(affiliateEnabled({ AFFILIATE_ENABLED: 'false' })).toBe(false);
    expect(affiliateEnabled({ AFFILIATE_ENABLED: 'true' })).toBe(true);

    expect(
      resolveReferral({
        enabled: false,
        nowMs: NOW,
        optedOut: false,
        cookie: click('ADA', NOW),
        stored: click('BEE', NOW),
        checkoutCode: 'promo_bee',
        partners: PARTNERS,
      }),
    ).toBeNull();
    expect(referralCookieValue({ enabled: false, optedOut: false, code: 'ADA', capturedAtMs: NOW })).toBeNull();
    expect(referralLocalStorageValue({ enabled: false, optedOut: false, code: 'ADA', capturedAtMs: NOW })).toBeNull();
    expect(
      commissionDecision({
        enabled: false,
        attributed: true,
        productSlug: 'BASIC',
        buyerEmail: 'buyer@example.com',
        partnerEmail: 'ada@partners.test',
      }),
    ).toEqual({ commissionCents: null, commissionStatus: null });
    expect(commissionStatusAfterReversal('PENDING', false)).toBe('PENDING');
  });

  it('reverses a commission on refund and leaves add-on refunds alone', () => {
    expect(commissionStatusAfterReversal('PENDING', true)).toBe('REVERSED');
    expect(commissionStatusAfterReversal('APPROVED', true)).toBe('REVERSED');
    expect(commissionStatusAfterReversal('PAID', true)).toBe('REVERSED');
    expect(commissionStatusAfterReversal('REVERSED', true)).toBe('REVERSED');
    expect(commissionStatusAfterReversal(null, true)).toBeNull();

    expect(
      shouldReverseCommission({
        enabled: true,
        purpose: null,
        paymentIntentId: 'pi_form',
        checkoutPaymentIntentId: 'pi_form',
        commissionStatus: 'PENDING',
      }),
    ).toBe(true);
    expect(
      shouldReverseCommission({
        enabled: true,
        purpose: 'ein',
        paymentIntentId: 'pi_ein',
        checkoutPaymentIntentId: 'pi_form',
        commissionStatus: 'PENDING',
      }),
    ).toBe(false);
    expect(
      shouldReverseCommission({
        enabled: false,
        purpose: null,
        paymentIntentId: 'pi_form',
        checkoutPaymentIntentId: 'pi_form',
        commissionStatus: 'PENDING',
      }),
    ).toBe(false);
  });

  it('records only the ref code when ad opt-out is set', () => {
    const cookie = referralCookieValue({
      enabled: true,
      optedOut: true,
      code: 'ada',
      capturedAtMs: NOW,
    });
    expect(cookie).toBe('ADA');
    expect(cookie).not.toContain('at');
    expect(referralLocalStorageValue({ enabled: true, optedOut: true, code: 'ADA', capturedAtMs: NOW })).toBeNull();
    expect(stripeReferralMetadata('ada')).toEqual({ ref: 'ADA' });
    expect(Object.keys(stripeReferralMetadata('ada'))).toEqual(['ref']);

    const choice = resolveReferral({
      enabled: true,
      nowMs: NOW,
      optedOut: true,
      cookie: click('ADA', NOW - 2 * DAY),
      stored: click('BEE', NOW - DAY),
      checkoutCode: null,
      partners: PARTNERS,
    });
    expect(choice).toMatchObject({ code: 'ADA', source: 'LINK' });
    expect(
      persistedReferral(
        {
          code: 'ADA',
          partnerId: 'p_ada',
          partnerEmail: 'ada@partners.test',
          source: 'LINK',
          capturedAtMs: NOW,
        },
        true,
      ),
    ).toEqual({
      referralCode: 'ADA',
      referralPartnerId: null,
      referralSource: null,
      referralCapturedAt: null,
    });
  });
});

describe('affiliate capture cookie', () => {
  const previous = process.env.AFFILIATE_ENABLED;

  afterEach(() => {
    if (previous === undefined) delete process.env.AFFILIATE_ENABLED;
    else process.env.AFFILIATE_ENABLED = previous;
  });

  function invoke(urlPath: string, cookie?: string, extra?: Record<string, string>) {
    const headers = new Headers({ host: 'launchforma.com', ...extra });
    if (cookie) headers.set('cookie', cookie);
    return middleware(new NextRequest(new URL(urlPath, 'https://launchforma.com'), { headers }));
  }

  it('sets a 30-day lf_ref cookie only when the flag is on', () => {
    delete process.env.AFFILIATE_ENABLED;
    const off = invoke('/pricing?ref=ada');
    expect(off.headers.get('set-cookie') ?? '').not.toContain(AFFILIATE_COOKIE);

    process.env.AFFILIATE_ENABLED = 'true';
    const on = invoke('/pricing?ref=ada');
    const cookies = on.headers.getSetCookie();
    const ref = cookies.find((row) => row.startsWith(`${AFFILIATE_COOKIE}=`));
    expect(ref).toBeTruthy();
    expect(ref).toContain('ADA');
    expect(ref).toContain(`Max-Age=${AFFILIATE_MAX_AGE_SECONDS}`);
    expect(ref?.toLowerCase()).toContain('samesite=lax');
    expect(ref).toContain('Path=/');
    expect(AFFILIATE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);

    const optedOut = invoke('/pricing?ref=ada', 'lf_ad_optout=1');
    const opted = optedOut.headers.getSetCookie().find((row) => row.startsWith(`${AFFILIATE_COOKIE}=`));
    expect(opted).toContain(`${AFFILIATE_COOKIE}=ADA`);
    expect(opted).not.toContain('%7B');
  });
});

describe('affiliate migration', () => {
  it('only adds tables and nullable columns', () => {
    const sql = readFileSync(
      'prisma/migrations/20261025210000_affiliate_partner/migration.sql',
      'utf8',
    );
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "Partner"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "referralPartnerId"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "commissionStatus"');
    expect(sql).toContain('ALTER TABLE "Partner" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "ServiceInquiry" ADD COLUMN IF NOT EXISTS "referralCode"');
  });
});
