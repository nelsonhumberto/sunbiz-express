'use server';

import { redirect } from 'next/navigation';
import { hrefForLocale } from '@/lib/app-href';
import { pickLocale } from '@/lib/pick-locale';
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
import { maySignInClaimedGuest } from '@/lib/guest-checkout';
import { claimPaidGuestAccount } from '@/lib/guest-checkout-claim';
import { submitFilingToState } from './filings';
import {
  ensureFilingTouchUtm,
  ensureUserFirstTouchUtm,
} from '@/lib/utm-attribution';
import { capturePurchaseCompletedServer, type PurchaseIntentLike } from '@/lib/posthog-server';
import { isInternalTrafficUser } from '@/lib/internal-traffic';
import { checkoutAttributionMetadata } from '@/lib/checkout-attribution';

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
  if (!actor) return { error: 'Please sign in.' };
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
  if (filing.status !== 'DRAFT') return { error: 'This filing has already been submitted.' };

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

  await sendEmail({
    type: 'PAYMENT_CONFIRMATION',
    to: actor.email ?? '',
    userId: actor.id,
    filingId: filing.id,
    context: {
      businessName: filing.businessName ?? '',
      totalCents: expectedTotal,
    },
  });

  await submitFilingToState(filing.id);

  // Guests become an account after the charge, on this same user id.
  // The set-password email is the way back in on another device. A session
  // is opened only when maySignInClaimedGuest confirms the loaded row is the
  // one we just promoted. We never sign in a user found by email alone.
  const checkoutLocale = pickLocale(await storedLocale(), filing.locale);
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
      const claimedPath = hrefForLocale(
        `/checkout/success?filing=${filing.id}&setPassword=1`,
        checkoutLocale,
      );
      if (claim.claimed && claim.email && claim.password) {
        const loaded = await prisma.user.findUnique({
          where: { id: actor.id },
          select: { id: true, email: true, accountStatus: true },
        });
        if (
          loaded &&
          maySignInClaimedGuest({
            claimedUserId: actor.id,
            claimedEmail: claim.email,
            loadedUserId: loaded.id,
            loadedEmail: loaded.email,
            loadedStatus: loaded.accountStatus,
          })
        ) {
          cookies().delete(GUEST_COOKIE);
          try {
            await signIn('credentials', {
              email: loaded.email,
              password: claim.password,
              redirect: false,
            });
            postCheckoutRedirect = claimedPath;
          } catch (signInErr) {
            logger.error(
              'post-checkout auto sign-in failed',
              { area: 'checkout', entityId: actor.id, tag: 'guest-auto-signin' },
              signInErr,
            );
            const next = encodeURIComponent(claimedPath);
            const email = encodeURIComponent(loaded.email);
            postCheckoutRedirect = hrefForLocale(
              `/sign-in?claimed=1&email=${email}&next=${next}`,
              checkoutLocale,
            );
          }
        } else {
          postCheckoutRedirect = claimedPath;
        }
      }
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
