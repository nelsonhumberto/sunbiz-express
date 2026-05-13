'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { filingIncludesEin } from '@/lib/ein';
import { sendEmail } from '@/lib/email';
import { safeParseJson } from '@/lib/utils';
import { submitFilingToState } from './filings';

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
}): Promise<CheckoutResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Please sign in.' };

  const filing = await prisma.filing.findUnique({
    where: { id: input.filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
    },
  });
  if (!filing || filing.userId !== session.user.id) return { error: 'Filing not found.' };
  if (filing.status !== 'DRAFT') return { error: 'This filing has already been submitted.' };

  // EIN gate: if the customer's package includes EIN, the responsible-party
  // form MUST have been completed before we accept payment. Otherwise we'd
  // submit the filing without the data needed to actually file Form SS-4.
  const addOnSlugsForGate = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  if (
    filingIncludesEin({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs: addOnSlugsForGate,
    })
  ) {
    const ein = filing.einApplication;
    const completed =
      !!ein &&
      (ein.status === 'ready_online' ||
        ein.status === 'manual_foreign' ||
        ein.status === 'submitted' ||
        ein.status === 'delivered');
    if (!completed) {
      return {
        error: 'EIN responsible-party details are required before checkout.',
      };
    }
  }

  // ── Tester bypass ────────────────────────────────────────────────────────
  // When an admin has flagged the user as a tester, any card is accepted and
  // no real Stripe charge is made. The sentinel paymentIntentId
  // "TESTER_BYPASS" signals this path.
  const callerUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isTester: true },
  });
  const isTesterBypass =
    callerUser?.isTester === true && input.paymentIntentId === 'TESTER_BYPASS';

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
    // Synthetic payment — no Stripe call
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
      userId: session.user.id,
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
    to: session.user.email!,
    userId: session.user.id,
    filingId: filing.id,
    context: {
      businessName: filing.businessName ?? '',
      totalCents: expectedTotal,
    },
  });

  await submitFilingToState(filing.id);

  revalidatePath('/dashboard');
  return { ok: true, redirectTo: `/checkout/success?filing=${filing.id}` };
}
