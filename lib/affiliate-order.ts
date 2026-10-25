// Server-only: reads cookies and writes Partner / Filing rows.
// Do not import this from a client component.

import { cookies, headers } from 'next/headers';
import type { CommissionStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { AD_OPT_OUT_COOKIE, isAdMeasurementOptedOut } from '@/lib/ad-opt-out';
import {
  AFFILIATE_COOKIE,
  affiliateEnabled,
  commissionDecision,
  commissionStatusAfterReversal,
  parseReferralCookie,
  parseStoredReferral,
  persistedReferral,
  productSlugForPayment,
  resolveReferral,
  shouldReverseCommission,
  stripeReferralMetadata,
  type AffiliatePartner,
  type OptOutReferralWrite,
  type ReferralChoice,
  type ReferralWrite,
} from '@/lib/affiliate';

export type { OptOutReferralWrite, ReferralWrite };

const partnerSelect = {
  id: true,
  code: true,
  email: true,
  status: true,
  stripePromotionCodeId: true,
} as const;

function requestOptedOut(): boolean {
  let cookie: string | null = null;
  let secGpc: string | null = null;
  try {
    cookie = cookies().get(AD_OPT_OUT_COOKIE)?.value ?? null;
  } catch {
    cookie = null;
  }
  try {
    secGpc = headers().get('sec-gpc');
  } catch {
    secGpc = null;
  }
  return isAdMeasurementOptedOut({ cookie, secGpc });
}

async function partnerFromStripePromotionCode(code: string) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const listed = await getStripe().promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });
    const id = listed.data[0]?.id;
    if (!id) return null;
    return prisma.partner.findFirst({
      where: { stripePromotionCodeId: id },
      select: partnerSelect,
    });
  } catch {
    return null;
  }
}

async function loadCandidatePartners(input: {
  codes: string[];
  checkoutCode: string | null;
}): Promise<AffiliatePartner[]> {
  const codes = [...new Set(input.codes)];
  const or = [];
  if (codes.length > 0) {
    or.push({ code: { in: codes } });
  }
  if (input.checkoutCode) {
    or.push({
      stripePromotionCodeId: { equals: input.checkoutCode, mode: 'insensitive' as const },
    });
  }
  const stripePartner = input.checkoutCode
    ? await partnerFromStripePromotionCode(input.checkoutCode)
    : null;
  const rows = or.length
    ? await prisma.partner.findMany({ where: { OR: or }, select: partnerSelect })
    : [];
  if (stripePartner && !rows.some((row) => row.id === stripePartner.id)) {
    rows.push(stripePartner);
  }
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    email: row.email,
    status: row.status,
    stripePromotionCodeId: row.stripePromotionCodeId,
  }));
}

/** Resolve the partner for this request. Returns null when the flag is off. */
export async function resolveAffiliateChoice(input: {
  checkoutCode?: string | null;
  storedReferral?: unknown;
  nowMs?: number;
}): Promise<ReferralChoice | null> {
  if (!affiliateEnabled()) return null;
  try {
    const nowMs = input.nowMs ?? Date.now();
    const optedOut = requestOptedOut();
    let cookieRaw: string | undefined;
    try {
      cookieRaw = cookies().get(AFFILIATE_COOKIE)?.value;
    } catch {
      cookieRaw = undefined;
    }
    const cookie = parseReferralCookie(cookieRaw, nowMs);
    const stored = optedOut ? null : parseStoredReferral(input.storedReferral);
    const checkoutCode = input.checkoutCode?.trim() || null;
    const partners = await loadCandidatePartners({
      codes: [cookie?.code, stored?.code].filter((code): code is string => Boolean(code)),
      checkoutCode,
    });
    return resolveReferral({
      enabled: true,
      nowMs,
      optedOut,
      cookie,
      stored,
      checkoutCode,
      partners,
    });
  } catch (err) {
    logger.warn('affiliate capture skipped', {
      area: 'affiliate',
      tag: 'resolve',
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Validate the code against an ACTIVE partner and store it on the filing.
 * Also returns the Stripe metadata fragment (`ref` only).
 */
export async function captureAffiliateForCheckout(input: {
  checkoutCode?: string | null;
  storedReferral?: unknown;
  filingId?: string;
  stampFiling: boolean;
  existingReferralCode?: string | null;
}): Promise<Record<string, string>> {
  const choice = await resolveAffiliateChoice({
    checkoutCode: input.checkoutCode,
    storedReferral: input.storedReferral,
  });
  if (!choice) return {};
  const mayWrite = Boolean(input.filingId && (input.stampFiling || !input.existingReferralCode));
  if (mayWrite && input.filingId) {
    try {
      await prisma.filing.update({
        where: { id: input.filingId },
        data: persistedReferral(choice, requestOptedOut()),
      });
    } catch (err) {
      logger.warn('affiliate filing stamp skipped', {
        area: 'affiliate',
        tag: 'stamp',
        entityId: input.filingId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return stripeReferralMetadata(choice.code);
}

/** Referral columns for a brand-new Filing or ServiceInquiry row. */
export async function referralDataForCapture(
  checkoutCode?: string | null,
): Promise<ReferralWrite | OptOutReferralWrite | null> {
  const choice = await resolveAffiliateChoice({ checkoutCode });
  if (!choice) return null;
  return persistedReferral(choice, requestOptedOut());
}

/** True when the checkout string is an ACTIVE partner's Stripe promotion code. */
export async function isActivePartnerPromotion(code: string | null | undefined): Promise<boolean> {
  if (!affiliateEnabled() || !code?.trim()) return false;
  try {
    const direct = await prisma.partner.findFirst({
      where: {
        status: 'ACTIVE',
        stripePromotionCodeId: { equals: code.trim(), mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (direct) return true;
    const viaStripe = await partnerFromStripePromotionCode(code.trim());
    return viaStripe?.status === 'ACTIVE';
  } catch {
    return false;
  }
}

export async function applyAffiliateCommissionForFiling(
  filingId: string,
  metadata?: {
    purpose?: string | null;
    product?: string | null;
    addOnSlug?: string | null;
    ref?: string | null;
  } | null,
): Promise<void> {
  if (!affiliateEnabled()) return;
  try {
    const filing = await prisma.filing.findUnique({
      where: { id: filingId },
      include: {
        referralPartner: { select: partnerSelect },
        user: { select: { email: true } },
      },
    });
    if (!filing) return;
    if (filing.commissionStatus || filing.commissionCents !== null) return;

    const purpose = metadata?.purpose ?? null;
    if (purpose && purpose !== 'formation') return;

    let partner = filing.referralPartner;
    if ((!partner || partner.status !== 'ACTIVE') && (filing.referralCode || metadata?.ref)) {
      const code = filing.referralCode || metadata?.ref || '';
      partner = await prisma.partner.findFirst({
        where: { code: code.trim().toUpperCase(), status: 'ACTIVE' },
        select: partnerSelect,
      });
      if (partner && !filing.referralPartnerId) {
        await prisma.filing.update({
          where: { id: filing.id },
          data: {
            referralCode: partner.code,
            referralPartnerId: partner.id,
          },
        });
      }
    }
    if (!partner || partner.status !== 'ACTIVE') return;

    const decision = commissionDecision({
      enabled: true,
      attributed: true,
      productSlug: productSlugForPayment({
        purpose,
        product: metadata?.product,
        addOnSlug: metadata?.addOnSlug,
        serviceTier: filing.serviceTier,
      }),
      buyerEmail: filing.user.email,
      partnerEmail: partner.email,
    });
    await prisma.filing.update({
      where: { id: filing.id },
      data: {
        commissionCents: decision.commissionCents,
        commissionStatus: decision.commissionStatus,
      },
    });
  } catch (err) {
    logger.warn('affiliate commission skipped', {
      area: 'affiliate',
      tag: 'commission',
      entityId: filingId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function reverseAffiliateCommission(input: {
  paymentIntentId: string;
  purpose?: string | null;
  filingId?: string | null;
}): Promise<boolean> {
  if (!affiliateEnabled()) return false;
  try {
    const payment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: input.paymentIntentId },
      select: { filingId: true },
    });
    const filingId = payment?.filingId ?? input.filingId ?? null;
    if (!filingId) return false;
    const filing = await prisma.filing.findUnique({
      where: { id: filingId },
      select: {
        id: true,
        commissionStatus: true,
        checkoutPaymentIntentId: true,
      },
    });
    if (!filing) return false;
    const status = (filing.commissionStatus ?? null) as CommissionStatus | null;
    if (
      !shouldReverseCommission({
        enabled: true,
        purpose: input.purpose ?? null,
        paymentIntentId: input.paymentIntentId,
        checkoutPaymentIntentId: filing.checkoutPaymentIntentId,
        commissionStatus: status,
      })
    ) {
      return false;
    }
    const next = commissionStatusAfterReversal(status, true);
    if (next !== 'REVERSED') return false;
    await prisma.filing.update({
      where: { id: filing.id },
      data: { commissionStatus: 'REVERSED' },
    });
    return true;
  } catch (err) {
    logger.warn('affiliate reversal skipped', {
      area: 'affiliate',
      tag: 'reversal',
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
