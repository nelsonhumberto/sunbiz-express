'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { sendEmail } from '@/lib/email-mock';
import { submitFilingToState } from './filings';

export interface CheckoutResult {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
}

export async function processCheckout(input: {
  filingId: string;
  paymentIntentId: string;
}): Promise<CheckoutResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Please sign in.' };

  const filing = await prisma.filing.findUnique({
    where: { id: input.filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
    },
  });
  if (!filing || filing.userId !== session.user.id) return { error: 'Filing not found.' };
  if (filing.status !== 'DRAFT') return { error: 'This filing has already been submitted.' };

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

  // Recompute cost to ensure server-side integrity
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const breakdown = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });

  // Verify amount matches (allow ±1 cent for rounding)
  if (Math.abs(pi.amount - breakdown.totalCents) > 1) {
    return { error: 'Payment amount mismatch. Please contact support.' };
  }

  // Extract card details from Stripe's PaymentMethod
  const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
  const cardLast4 = pm?.card?.last4 ?? null;
  const cardBrand = pm?.card?.brand
    ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
    : null;
  const cardholderName = pm?.billing_details?.name ?? null;
  const pmId = typeof pm === 'string' ? pm : pm?.id ?? null;

  await prisma.payment.create({
    data: {
      filingId: filing.id,
      userId: session.user.id,
      stripePaymentIntentId: pi.id,
      stripePaymentMethodId: pmId,
      amountCents: pi.amount,
      status: 'SUCCEEDED',
      stateFilingFeeCents: breakdown.governmentRemittanceCents,
      formationServiceFeeCents: breakdown.packageMarginCents,
      otherServicesCents: breakdown.addOnsCents,
      cardLast4,
      cardBrand,
      cardholderName,
      completedAt: new Date(),
    },
  });

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      stateFeeCents: breakdown.governmentRemittanceCents,
      serviceFeeCents: breakdown.packageMarginCents,
      addOnsTotalCents: breakdown.addOnsCents,
      totalCents: breakdown.totalCents,
      completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    },
  });

  await sendEmail({
    type: 'PAYMENT_CONFIRMATION',
    to: session.user.email!,
    userId: session.user.id,
    filingId: filing.id,
    context: {
      businessName: filing.businessName ?? '',
      totalCents: breakdown.totalCents,
    },
  });

  await submitFilingToState(filing.id);

  revalidatePath('/dashboard');
  return { ok: true, redirectTo: `/checkout/success?filing=${filing.id}` };
}
