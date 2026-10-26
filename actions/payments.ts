'use server';

import { redirect } from 'next/navigation';
import { hrefForLocale } from '@/lib/app-href';
import { localeFromPathOrFiling } from '@/lib/request-locale';
import { storedLocale } from '@/lib/stored-locale';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { auth, signIn } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import {
  computeCost,
  RA_AUTORENEW_CHECKED_BY_DEFAULT,
  tierBundledStateFeeCents,
  type AddOnSlug,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import { isTestPayment } from '@/lib/payment-test';
import {
  CHECKOUT_BELOW_STATE_FEE_ERROR,
  checkoutBelowStateFee,
} from '@/lib/checkout-guard';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { safeParseJson } from '@/lib/utils';
import { assertFilingReadyForSubmission } from '@/lib/filing-readiness';
import { getWizardActor, GUEST_COOKIE } from '@/lib/guest';
import { CHECKOUT_ACCOUNT_REQUIRED, checkoutAllowsPayment } from '@/lib/guest-identity';
import {
  maySignInClaimedGuest,
  planGuestClaimFollowUp,
  planRecoveredGuestClaim,
  submittedFilingHref,
  withGuestSetPasswordPending,
} from '@/lib/guest-checkout';
import { claimPaidGuestAccount, type GuestClaimResult } from '@/lib/guest-checkout-claim';
import type { SiteLocale } from '@/lib/pick-locale';
import { notifyAdminOfPaidOrder } from '@/lib/paid-order-alert';
import { submitFilingToState } from './filings';
import {
  ensureFilingTouchUtm,
  ensureUserFirstTouchUtm,
} from '@/lib/utm-attribution';
import { capturePurchaseCompletedServer, type PurchaseIntentLike } from '@/lib/posthog-server';
import { isInternalTrafficUser } from '@/lib/internal-traffic';
import { checkoutAttributionMetadata } from '@/lib/checkout-attribution';

function isUniqueConflict(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'P2002',
  );
}

function claimedSignInHref(email: string, filingId: string, locale: SiteLocale): string {
  const next = hrefForLocale(`/checkout/success?filing=${filingId}&setPassword=1`, locale);
  return hrefForLocale(
    `/sign-in?claimed=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
    locale,
  );
}

/**
 * Open a session when we just promoted the guest. If this PaymentIntent
 * already promoted them, send the same claimed sign-in the success page uses.
 */
async function finishGuestClaim(input: {
  actorId: string;
  filingId: string;
  locale: SiteLocale;
  paymentIntentUserId: string | null;
  paymentIntentFilingId: string | null;
  claim: GuestClaimResult;
}): Promise<string | null> {
  const follow = planGuestClaimFollowUp({
    actorId: input.actorId,
    filingId: input.filingId,
    paymentIntentUserId: input.paymentIntentUserId,
    paymentIntentFilingId: input.paymentIntentFilingId,
    claim: input.claim,
  });
  const claimedPath = hrefForLocale(
    `/checkout/success?filing=${input.filingId}&setPassword=1`,
    input.locale,
  );
  if (follow === 'open_session' && input.claim.email && input.claim.password) {
    const loaded = await prisma.user.findUnique({
      where: { id: input.actorId },
      select: { id: true, email: true, accountStatus: true },
    });
    if (
      loaded &&
      maySignInClaimedGuest({
        claimedUserId: input.actorId,
        claimedEmail: input.claim.email,
        loadedUserId: loaded.id,
        loadedEmail: loaded.email,
        loadedStatus: loaded.accountStatus,
      })
    ) {
      cookies().delete(GUEST_COOKIE);
      try {
        await signIn('credentials', {
          email: loaded.email,
          password: input.claim.password,
          redirect: false,
        });
        return claimedPath;
      } catch (signInErr) {
        logger.error(
          'post-checkout auto sign-in failed',
          { area: 'checkout', entityId: input.actorId, tag: 'guest-auto-signin' },
          signInErr,
        );
      }
    }
    return claimedSignInHref(input.claim.email, input.filingId, input.locale);
  }
  if (follow === 'claimed_sign_in' && input.claim.email) {
    cookies().delete(GUEST_COOKIE);
    return claimedSignInHref(input.claim.email, input.filingId, input.locale);
  }
  return null;
}

/** Webhook already promoted this PaymentIntent's guest. No session is created. */
async function recoveredClaimedSignIn(
  filingId: string,
  paymentIntentId: string,
): Promise<string | null> {
  if (!paymentIntentId || paymentIntentId === 'TESTER_BYPASS') return null;
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { filingId: true, userId: true, status: true, stripePaymentIntentId: true },
  });
  if (!payment || payment.status !== 'SUCCEEDED') return null;
  const [filing, user] = await Promise.all([
    prisma.filing.findUnique({
      where: { id: filingId },
      select: { id: true, userId: true, locale: true },
    }),
    prisma.user.findUnique({
      where: { id: payment.userId },
      select: { email: true, accountStatus: true },
    }),
  ]);
  if (!filing || !user) return null;
  let status = '';
  let piUser: string | null = null;
  let piFiling: string | null = null;
  try {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
    status = pi.status;
    piUser = pi.metadata?.userId ?? null;
    piFiling = pi.metadata?.filingId ?? null;
  } catch {
    return null;
  }
  const decision = planRecoveredGuestClaim({
    filingId,
    filingUserId: filing.userId,
    paymentIntentId,
    paymentIntentStatus: status,
    paymentIntentUserId: piUser,
    paymentIntentFilingId: piFiling,
    recordedPaymentIntentId: payment.stripePaymentIntentId,
    recordedFilingId: payment.filingId,
    recordedUserId: payment.userId,
    accountStatus: user.accountStatus,
    accountEmail: user.email,
  });
  if (decision.followUp !== 'claimed_sign_in') return null;
  const locale = localeFromPathOrFiling(await storedLocale(), filing.locale);
  return claimedSignInHref(decision.email, filingId, locale);
}

function asStateCode(input: string | null | undefined): StateCode {
  const upper = (input ?? 'FL').toUpperCase();
  return ACTIVE_FORMATION_STATES.includes(upper as StateCode)
    ? (upper as StateCode)
    : 'FL';
}

export interface CheckoutResult {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
}

export async function processCheckout(input: {
  filingId: string;
  paymentIntentId: string;
  couponId?: string;
  couponCode?: string;
  discountCents?: number;
  /**
   * Customer opted into Registered Agent auto-renewal at checkout. Persisted
   * onto the filing's optionalDetails so submitFilingToState stamps consent
   * (autoRenew + autoRenewConsentAt) onto the RegisteredAgentService it creates.
   * Only meaningful when the customer chose our RA.
   */
  autoRenewRa?: boolean;
}): Promise<CheckoutResult> {
  const session = await auth();
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  if (!actor) {
    const redirectTo = await recoveredClaimedSignIn(input.filingId, input.paymentIntentId);
    if (redirectTo) return { ok: true, redirectTo };
    return { error: 'Please sign in.' };
  }
  // A guest pays only after the PaymentIntent route stored a real email on
  // that guest. Placeholder rows still stop here. We never look a payer up
  // by the typed email and sign into that other account.
  if (!checkoutAllowsPayment(actor.kind, actor.email)) {
    return { error: CHECKOUT_ACCOUNT_REQUIRED };
  }

  const filing = await prisma.filing.findUnique({
    where: { id: input.filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
    },
  });
  if (!filing || filing.userId !== actor.id) return { error: 'Filing not found.' };
  if (filing.status !== 'DRAFT') {
    // The webhook can submit before this request returns. A guest still needs
    // the set-password success page. A signed-in checkout keeps the error.
    if (actor.kind === 'guest') {
      const locale = localeFromPathOrFiling(await storedLocale(), filing.locale);
      const pending = withGuestSetPasswordPending(
        safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null),
      );
      await prisma.filing.update({
        where: { id: filing.id },
        data: { optionalDetails: JSON.stringify(pending) },
      });
      return {
        ok: true,
        redirectTo: hrefForLocale(submittedFilingHref(filing.id, pending), locale),
      };
    }
    return { error: 'This filing has already been submitted.' };
  }

  // Retarget campaigns may arrive after the draft was created - backfill
  // attribution from the current lf_utm cookie before we finalize payment.
  await ensureFilingTouchUtm(filing.id);
  await ensureUserFirstTouchUtm(actor.id);

  const addOnSlugsForGate = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );

  // Completeness + EIN gate (shared with the Stripe webhook backstop so neither
  // path can charge + submit an incomplete draft that would yield blank docs).
  const readiness = await assertFilingReadyForSubmission(filing.id);
  if (!readiness.ok) {
    return { error: readiness.error };
  }

  // ── Tester bypass ────────────────────────────────────────────────────────
  // When an admin has flagged the user as a tester, any card is accepted and
  // no real Stripe charge is made. Guests can never be testers (they have no
  // admin-assigned isTester flag), so this path is gated to authed users.
  let isTesterBypass = false;
  if (actor.kind === 'user') {
    const callerUser = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { isTester: true },
    });
    isTesterBypass =
      callerUser?.isTester === true && input.paymentIntentId === 'TESTER_BYPASS';
  }

  // Recompute cost (needed in both paths for fee breakdown storage)
  const addOnSlugs = addOnSlugsForGate;
  const optionalDetails = safeParseJson<Record<string, unknown> | null>(
    filing.optionalDetails,
    null,
  );
  const processingOptionId =
    optionalDetails && typeof optionalDetails.processingOption === 'string'
      ? (optionalDetails.processingOption as string)
      : undefined;
  const breakdown = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
    state: asStateCode(filing.state),
    processingOptionId,
  });
  const discountCents = input.discountCents ?? 0;
  const expectedTotal = Math.max(0, breakdown.totalCents - discountCents);
  const stateFeeMinimum = tierBundledStateFeeCents(
    filing.serviceTier as TierSlug,
    filing.entityType as EntityType,
    asStateCode(filing.state),
  );
  if (checkoutBelowStateFee({ totalCents: expectedTotal, stateFeeCents: stateFeeMinimum })) {
    return { error: CHECKOUT_BELOW_STATE_FEE_ERROR };
  }

  let cardLast4: string | null = null;
  let cardBrand: string | null = null;
  let cardholderName: string | null = null;
  let pmId: string | null = null;
  let stripeIntentId: string;
  let livemode: boolean | null = null;
  let paidIntent: PurchaseIntentLike;

  if (isTesterBypass) {
    // Synthetic payment - no Stripe call
    stripeIntentId = `TESTER_${Date.now()}`;
    cardLast4 = '4242';
    cardBrand = 'Visa';
    cardholderName = 'Test User';
    paidIntent = {
      id: stripeIntentId,
      amount: expectedTotal,
      currency: 'usd',
      metadata: {
        filingId: filing.id,
        userId: actor.id,
        ...checkoutAttributionMetadata({ filing }),
      },
    };
  } else {
    // Verify the PaymentIntent with Stripe
    let pi;
    try {
      pi = await getStripe().paymentIntents.retrieve(input.paymentIntentId, {
        expand: ['payment_method'],
      });
    } catch {
      return { error: 'Could not verify payment. Please try again.' };
    }

    if (pi.status !== 'succeeded') {
      return { error: `Payment not completed (status: ${pi.status}). Please try again.` };
    }

    // The PaymentIntent must belong to THIS filing. Stops a PI created for one
    // filing from being replayed to finalize a different (cheaper) one.
    if (pi.metadata?.filingId && pi.metadata.filingId !== filing.id) {
      logger.error(
        'checkout PI/filing mismatch',
        { area: 'stripe', entityId: filing.id, tag: 'pi-filing-mismatch' },
        pi.metadata.filingId,
      );
      return { error: 'Payment does not match this filing. Please contact support.' };
    }
    if (pi.metadata?.userId && pi.metadata.userId !== actor.id) {
      logger.error(
        'checkout PI/user mismatch',
        { area: 'stripe', entityId: filing.id, tag: 'pi-user-mismatch' },
      );
      return { error: 'Payment does not match this filing. Please contact support.' };
    }

    // Verify amount matches (allow ±1 cent for rounding)
    if (Math.abs(pi.amount - expectedTotal) > 1) {
      return { error: 'Payment amount mismatch. Please contact support.' };
    }

    const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
    cardLast4 = pm?.card?.last4 ?? null;
    cardBrand = pm?.card?.brand
      ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
      : null;
    cardholderName = pm?.billing_details?.name ?? null;
    pmId = typeof pm === 'string' ? pm : pm?.id ?? null;
    stripeIntentId = pi.id;
    livemode = pi.livemode;
    paidIntent = {
      id: pi.id,
      amount: pi.amount,
      amount_received: pi.amount_received,
      currency: pi.currency,
      created: pi.created,
      metadata: pi.metadata,
    };
  }

  const piUserId =
    typeof paidIntent.metadata?.userId === 'string' ? paidIntent.metadata.userId : null;
  const piFilingId =
    typeof paidIntent.metadata?.filingId === 'string' ? paidIntent.metadata.filingId : null;
  try {
    await prisma.payment.create({
      data: {
        filingId: filing.id,
        userId: actor.id,
        stripePaymentIntentId: stripeIntentId,
        stripePaymentMethodId: pmId,
        amountCents: expectedTotal,
        status: 'SUCCEEDED',
        isTest: isTestPayment({ stripePaymentIntentId: stripeIntentId, livemode }),
        stateFilingFeeCents: breakdown.governmentRemittanceCents,
        formationServiceFeeCents: breakdown.packageMarginCents,
        otherServicesCents: breakdown.addOnsCents,
        cardLast4,
        cardBrand,
        cardholderName,
        couponCode: input.couponCode ?? null,
        discountCents,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    // The webhook inserted this PaymentIntent and may already have claimed
    // the guest. Replay the claimed sign-in instead of a second payment.
    if (isUniqueConflict(err) && actor.kind === 'guest') {
      const checkoutLocale = localeFromPathOrFiling(await storedLocale(), filing.locale);
      const claim = await claimPaidGuestAccount({
        userId: actor.id,
        filingId: filing.id,
        locale: checkoutLocale,
      });
      const redirectTo = await finishGuestClaim({
        actorId: actor.id,
        filingId: filing.id,
        locale: checkoutLocale,
        paymentIntentUserId: piUserId,
        paymentIntentFilingId: piFilingId,
        claim,
      });
      if (redirectTo) return { ok: true, redirectTo };
    }
    throw err;
  }

  // The Payment insert is the transition to paid. The webhook captures only
  // when it wins that insert, so a succeeded PaymentIntent is one event.
  const buyer = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { role: true, email: true },
  });
  await capturePurchaseCompletedServer(paidIntent, {
    internal: isInternalTrafficUser(buyer ?? { email: actor.email }),
  });

  // Server default matches the checkout checkbox: off unless this request
  // explicitly opts in. Omitted or false never enrolls the customer.
  const autoRenewRa =
    typeof input.autoRenewRa === 'boolean'
      ? input.autoRenewRa
      : RA_AUTORENEW_CHECKED_BY_DEFAULT;
  const existingOptional =
    safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null) ?? {};
  const nextOptional: Record<string, unknown> = {
    ...existingOptional,
    autoRenewRa,
  };
  // Set before submit. The wizard re-render after this action redirects, and
  // it must already see that a guest should stay on the success page.
  if (actor.kind === 'guest') {
    Object.assign(nextOptional, withGuestSetPasswordPending(nextOptional));
  }
  if (autoRenewRa) {
    nextOptional.autoRenewConsentAt = new Date().toISOString();
  } else {
    delete nextOptional.autoRenewConsentAt;
  }
  const optionalDetailsUpdate = JSON.stringify(nextOptional);

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      stateFeeCents: breakdown.governmentRemittanceCents,
      serviceFeeCents: breakdown.packageMarginCents,
      addOnsTotalCents: breakdown.addOnsCents,
      discountCents,
      totalCents: expectedTotal,
      couponCode: input.couponCode ?? null,
      couponId: input.couponId ?? null,
      optionalDetails: optionalDetailsUpdate,
      completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    },
  });

  // Increment coupon usage counter
  if (input.couponId) {
    await prisma.coupon.update({
      where: { id: input.couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // A path we actually saw wins over the filing's saved locale. With no
  // path, the filing locale remains. English stays unprefixed.
  const checkoutLocale = localeFromPathOrFiling(await storedLocale(), filing.locale);

  await sendEmail({
    type: 'PAYMENT_CONFIRMATION',
    to: actor.email ?? '',
    userId: actor.id,
    filingId: filing.id,
    context: {
      businessName: filing.businessName ?? '',
      totalCents: expectedTotal,
      locale: checkoutLocale,
    },
  });

  await notifyAdminOfPaidOrder(filing.id);

  await submitFilingToState(filing.id);

  // Guests become an account after the charge, on this same user id.
  // The set-password email is the way back in on another device. A session
  // is opened only when maySignInClaimedGuest confirms the loaded row is the
  // one we just promoted. We never sign in a user found by email alone.
  const successPath = hrefForLocale(
    `/checkout/success?filing=${filing.id}`,
    checkoutLocale,
  );
  let postCheckoutRedirect = successPath;
  if (actor.kind === 'guest') {
    try {
      const claim = await claimPaidGuestAccount({
        userId: actor.id,
        filingId: filing.id,
        locale: checkoutLocale,
      });
      const next = await finishGuestClaim({
        actorId: actor.id,
        filingId: filing.id,
        locale: checkoutLocale,
        paymentIntentUserId: piUserId,
        paymentIntentFilingId: piFilingId,
        claim,
      });
      if (next) postCheckoutRedirect = next;
    } catch (err) {
      logger.error(
        'guest auto-claim failed',
        { area: 'checkout', entityId: actor.id, tag: 'guest-auto-claim' },
        err,
      );
    }
  }

  revalidatePath('/dashboard');
  return { ok: true, redirectTo: postCheckoutRedirect };
}
