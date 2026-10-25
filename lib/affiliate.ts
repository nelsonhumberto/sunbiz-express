/**
 * Invite-only affiliate program.
 *
 * Flat commission per paid order, keyed by the tier slug in lib/pricing.ts
 * (BASIC Essential, STANDARD Popular, PREMIUM Premium) plus the launch-bundle
 * and llc_reinstatement product slugs. Add-ons are absent from the map and
 * earn $0. Nothing is captured unless AFFILIATE_ENABLED is on.
 */

export const AFFILIATE_COOKIE = 'lf_ref';
export const AFFILIATE_STORAGE_KEY = 'lf_ref';
/** 30 days, in seconds. Cookie Max-Age and the server-side click window. */
export const AFFILIATE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Commission in cents for one paid order. Keys are product slugs:
 * BASIC / STANDARD / PREMIUM match TierSlug in lib/pricing.ts.
 * launch-bundle and llc_reinstatement are the other paid products.
 * Any other slug, including add-ons bought on their own, is $0.
 */
export const AFFILIATE_COMMISSION_CENTS = {
  BASIC: 1_000,
  STANDARD: 5_000,
  PREMIUM: 10_000,
  'launch-bundle': 2_000,
  llc_reinstatement: 4_000,
} as const;

export type AffiliateProductSlug = keyof typeof AFFILIATE_COMMISSION_CENTS;
export type AffiliatePartnerStatus = 'ACTIVE' | 'PAUSED' | 'REMOVED';
export type AffiliateSource = 'LINK' | 'PROMO_CODE';
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';

export type AffiliatePartner = {
  id: string;
  code: string;
  email: string;
  status: AffiliatePartnerStatus;
  stripePromotionCodeId: string | null;
};

export type AffiliateClick = {
  code: string;
  capturedAtMs: number;
};

export type ReferralChoice = {
  code: string;
  partnerId: string;
  partnerEmail: string;
  source: AffiliateSource;
  capturedAtMs: number;
};

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export function affiliateEnabled(env?: { AFFILIATE_ENABLED?: string }): boolean {
  const raw = (env ?? process.env).AFFILIATE_ENABLED;
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function normalizeAffiliateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  return code;
}

export function commissionCentsForProduct(slug: string | null | undefined): number {
  if (!slug) return 0;
  if (Object.prototype.hasOwnProperty.call(AFFILIATE_COMMISSION_CENTS, slug)) {
    return AFFILIATE_COMMISSION_CENTS[slug as AffiliateProductSlug];
  }
  return 0;
}

export function emailsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Commission for one paid, attributed order.
 * Self-referral (buyer email equals partner email) stores $0 and no status.
 * Add-ons and unknown products store $0 and no status.
 * A qualifying product stores the flat amount as PENDING.
 */
export function commissionDecision(input: {
  enabled: boolean;
  attributed: boolean;
  productSlug: string | null;
  buyerEmail?: string | null;
  partnerEmail?: string | null;
}): { commissionCents: number | null; commissionStatus: CommissionStatus | null } {
  if (!input.enabled || !input.attributed) {
    return { commissionCents: null, commissionStatus: null };
  }
  if (emailsMatch(input.buyerEmail, input.partnerEmail)) {
    return { commissionCents: 0, commissionStatus: null };
  }
  const cents = commissionCentsForProduct(input.productSlug);
  if (cents <= 0) return { commissionCents: 0, commissionStatus: null };
  return { commissionCents: cents, commissionStatus: 'PENDING' };
}

export function productSlugForPayment(input: {
  purpose?: string | null;
  product?: string | null;
  addOnSlug?: string | null;
  serviceTier?: string | null;
}): string | null {
  const product = input.product?.trim();
  if (product === 'launch-bundle' || product === 'llc_reinstatement') return product;
  if (input.addOnSlug) return input.addOnSlug;
  if (input.purpose && input.purpose !== 'formation') return input.purpose;
  return input.serviceTier ?? product ?? null;
}

export function commissionStatusAfterReversal(
  status: CommissionStatus | null,
  enabled: boolean,
): CommissionStatus | null {
  if (!enabled) return status;
  if (status === 'PENDING' || status === 'APPROVED' || status === 'PAID') return 'REVERSED';
  return status;
}

/** Add-on refunds must not claw back a formation commission. */
export function shouldReverseCommission(input: {
  enabled: boolean;
  purpose: string | null;
  paymentIntentId: string;
  checkoutPaymentIntentId: string | null;
  commissionStatus: CommissionStatus | null;
}): boolean {
  if (!input.enabled) return false;
  if (input.commissionStatus !== 'PENDING' && input.commissionStatus !== 'APPROVED' && input.commissionStatus !== 'PAID') {
    return false;
  }
  if (input.purpose && input.purpose !== 'formation') return false;
  if (input.checkoutPaymentIntentId && input.paymentIntentId !== input.checkoutPaymentIntentId) {
    return false;
  }
  return true;
}

/**
 * Last click inside 30 days wins. A partner Stripe promotion code entered
 * at checkout beats any cookie or localStorage click. Paused and removed
 * partners are ignored. Opt-out drops the localStorage click and keeps the
 * cookie code only.
 */
export function resolveReferral(input: {
  enabled: boolean;
  nowMs: number;
  optedOut: boolean;
  cookie: AffiliateClick | null;
  stored: AffiliateClick | null;
  checkoutCode: string | null;
  partners: AffiliatePartner[];
}): ReferralChoice | null {
  if (!input.enabled) return null;

  const promo = activePromoPartner(input.partners, input.checkoutCode);
  if (promo) {
    return {
      code: promo.code.toUpperCase(),
      partnerId: promo.id,
      partnerEmail: promo.email,
      source: 'PROMO_CODE',
      capturedAtMs: input.nowMs,
    };
  }

  const clicks: AffiliateClick[] = [];
  if (input.cookie) clicks.push(input.cookie);
  if (!input.optedOut && input.stored) clicks.push(input.stored);

  const fresh = clicks
    .map((click) => {
      const code = normalizeAffiliateCode(click.code);
      return code ? { code, capturedAtMs: click.capturedAtMs } : null;
    })
    .filter((click): click is AffiliateClick => {
      if (!click) return false;
      if (click.capturedAtMs > input.nowMs + 60_000) return false;
      return input.nowMs - click.capturedAtMs <= AFFILIATE_MAX_AGE_SECONDS * 1000;
    })
    .sort((a, b) => b.capturedAtMs - a.capturedAtMs);

  for (const click of fresh) {
    const partner = input.partners.find(
      (row) => row.code.toUpperCase() === click.code && row.status === 'ACTIVE',
    );
    if (!partner) continue;
    return {
      code: partner.code.toUpperCase(),
      partnerId: partner.id,
      partnerEmail: partner.email,
      source: 'LINK',
      capturedAtMs: click.capturedAtMs,
    };
  }
  return null;
}

function activePromoPartner(
  partners: AffiliatePartner[],
  checkoutCode: string | null,
): AffiliatePartner | null {
  const entered = checkoutCode?.trim();
  if (!entered || entered.length > 200) return null;
  const needle = entered.toLowerCase();
  const match = partners.find(
    (partner) => partner.stripePromotionCodeId?.trim().toLowerCase() === needle,
  );
  if (!match || match.status !== 'ACTIVE') return null;
  return match;
}

/** Cookie value. Opt-out stores the code alone. Otherwise code plus click time. */
export function referralCookieValue(input: {
  enabled: boolean;
  optedOut: boolean;
  code: string;
  capturedAtMs: number;
}): string | null {
  if (!input.enabled) return null;
  const code = normalizeAffiliateCode(input.code);
  if (!code) return null;
  if (input.optedOut) return code;
  return JSON.stringify({ code, at: input.capturedAtMs });
}

/** localStorage payload. Opt-out and a disabled flag write nothing. */
export function referralLocalStorageValue(input: {
  enabled: boolean;
  optedOut: boolean;
  code: string;
  capturedAtMs: number;
}): string | null {
  if (!input.enabled || input.optedOut) return null;
  const code = normalizeAffiliateCode(input.code);
  if (!code) return null;
  return JSON.stringify({ code, at: input.capturedAtMs });
}

/** Stripe metadata for the referral. The only key is the partner code. */
export function stripeReferralMetadata(code: string | null | undefined): Record<string, string> {
  const normalized = normalizeAffiliateCode(code);
  if (!normalized) return {};
  return { ref: normalized };
}

export function parseReferralCookie(
  raw: string | null | undefined,
  nowMs: number,
): AffiliateClick | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { code?: unknown; at?: unknown };
      const code = typeof parsed.code === 'string' ? normalizeAffiliateCode(parsed.code) : null;
      const at = typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : null;
      if (!code || at == null) return null;
      if (at > nowMs + 60_000) return null;
      if (nowMs - at > AFFILIATE_MAX_AGE_SECONDS * 1000) return null;
      return { code, capturedAtMs: at };
    } catch {
      return null;
    }
  }
  const code = normalizeAffiliateCode(trimmed);
  if (!code) return null;
  return { code, capturedAtMs: nowMs };
}

export type ReferralWrite = {
  referralCode: string;
  referralPartnerId: string;
  referralSource: AffiliateSource;
  referralCapturedAt: Date;
};

export type OptOutReferralWrite = {
  referralCode: string;
  referralPartnerId: null;
  referralSource: null;
  referralCapturedAt: null;
};

export function referralWriteData(choice: ReferralChoice): ReferralWrite {
  return {
    referralCode: choice.code,
    referralPartnerId: choice.partnerId,
    referralSource: choice.source,
    referralCapturedAt: new Date(choice.capturedAtMs),
  };
}

/**
 * Opt-out keeps the partner code and drops the partner id, click time, and
 * source. The partner id is attached later, only when commission is calculated.
 */
export function persistedReferral(
  choice: ReferralChoice,
  optedOut: boolean,
): ReferralWrite | OptOutReferralWrite {
  if (!optedOut) return referralWriteData(choice);
  return {
    referralCode: choice.code,
    referralPartnerId: null,
    referralSource: null,
    referralCapturedAt: null,
  };
}

export function parseStoredReferral(raw: unknown): AffiliateClick | null {
  let value = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return null;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const codeRaw = typeof record.code === 'string' ? record.code : null;
  const code = normalizeAffiliateCode(codeRaw);
  const at =
    typeof record.capturedAt === 'number'
      ? record.capturedAt
      : typeof record.at === 'number'
        ? record.at
        : null;
  if (!code || at == null || !Number.isFinite(at)) return null;
  return { code, capturedAtMs: at };
}
