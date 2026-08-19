'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { auth, signIn } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { safeParseJson } from '@/lib/utils';
import { assertFilingReadyForSubmission } from '@/lib/filing-readiness';
import { getWizardActor, GUEST_COOKIE } from '@/lib/guest';
import { submitFilingToState } from './filings';
import {
  ensureFilingTouchUtm,
  ensureUserFirstTouchUtm,
} from '@/lib/utm-attribution';

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

  let cardLast4: string | null = null;
  let cardBrand: string | null = null;
  let cardholderName: string | null = null;
  let pmId: string | null = null;
  let stripeIntentId: string;

  if (isTesterBypass) {
    // Synthetic payment - no Stripe call
    stripeIntentId = `TESTER_${Date.now()}`;
    cardLast4 = '4242';
    cardBrand = 'Visa';
    cardholderName = 'Test User';
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
  }

  await prisma.payment.create({
    data: {
      filingId: filing.id,
      userId: actor.id,
      stripePaymentIntentId: stripeIntentId,
      stripePaymentMethodId: pmId,
      amountCents: expectedTotal,
      status: 'SUCCEEDED',
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

  // Merge auto-renew consent into optionalDetails so submitFilingToState (which
  // creates the RA service) can read it. Untouched when no consent was given.
  const existingOptional =
    safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null) ?? {};
  const optionalDetailsUpdate = input.autoRenewRa
    ? JSON.stringify({
        ...existingOptional,
        autoRenewRa: true,
        autoRenewConsentAt: new Date().toISOString(),
      })
    : filing.optionalDetails;

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

  // ── Auto-convert guests to real accounts after successful checkout ──
  //
  // Guests who pay should immediately have a real account so they can sign
  // in, download documents, and manage compliance reminders. We email them
  // a temporary password and route them through /sign-in so they can land
  // on the dashboard with a real session. The checkout-success page lives
  // behind auth so this also bridges them into the account-only area.
  let postCheckoutRedirect = `/checkout/success?filing=${filing.id}`;
  if (actor.kind === 'guest' && actor.email) {
    try {
      const guestRow = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { accountStatus: true, firstName: true, email: true },
      });
      if (guestRow?.accountStatus === 'GUEST') {
        const tempPassword = generatePostCheckoutPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        await prisma.user.update({
          where: { id: actor.id },
          data: {
            passwordHash,
            accountStatus: 'ACTIVE',
            guestToken: null,
          },
        });
        cookies().delete(GUEST_COOKIE);
        try {
          await sendEmail({
            type: 'WELCOME',
            to: guestRow.email,
            userId: actor.id,
            context: {
              firstName: guestRow.firstName ?? undefined,
              tempPassword,
              loginEmail: guestRow.email,
            },
          });
        } catch (err) {
          logger.error('welcome email failed for guest', {
            area: 'checkout',
            entityId: actor.id,
            tag: 'guest-welcome-email',
          }, err);
        }
        // Seamlessly establish a session so the buyer lands directly on the
        // success page instead of being bounced to /sign-in. We hold the
        // plaintext temp password only in-memory here. If sign-in fails for
        // any reason, fall back to the prefilled /sign-in bounce.
        try {
          await signIn('credentials', {
            email: guestRow.email,
            password: tempPassword,
            redirect: false,
          });
          postCheckoutRedirect = `/checkout/success?filing=${filing.id}`;
        } catch (signInErr) {
          logger.error('post-checkout auto sign-in failed', {
            area: 'checkout',
            entityId: actor.id,
            tag: 'guest-auto-signin',
          }, signInErr);
          const next = encodeURIComponent(`/checkout/success?filing=${filing.id}`);
          const email = encodeURIComponent(guestRow.email);
          postCheckoutRedirect = `/sign-in?claimed=1&email=${email}&next=${next}`;
        }
      }
    } catch (err) {
      logger.error('guest auto-claim failed', {
        area: 'checkout',
        entityId: actor.id,
        tag: 'guest-auto-claim',
      }, err);
    }
  }

  revalidatePath('/dashboard');
  return { ok: true, redirectTo: postCheckoutRedirect };
}

/**
 * 14-character readable password used when we auto-claim a guest's account
 * at checkout. Comfortably above OWASP minimums and avoids ambiguous
 * characters (0/O/1/l/I).
 */
function generatePostCheckoutPassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 10 }, () => pick(all));
  return [...required, ...rest]
    .sort(() => crypto.randomInt(0, 2) - 0.5)
    .join('');
}
