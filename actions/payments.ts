'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { computeCost, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { sendEmail } from '@/lib/email-mock';
import { detectBrand, maskCardLast4 } from '@/lib/stripe-mock';
import { submitFilingToState } from './filings';

export interface CheckoutResult {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
}

export async function processCheckout(input: {
  filingId: string;
  cardNumber: string;
  cardholderName: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  zip: string;
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

  // Validate the card
  const digits = input.cardNumber.replace(/\s+/g, '');
  if (digits.length < 13) return { error: 'Card number is too short.' };
  if (digits === '4000000000000002') {
    return { error: 'Your card was declined. Try a different card.' };
  }

  // Recompute cost
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug
  );
  const breakdown = computeCost({
    entityType: filing.entityType as 'LLC' | 'CORP',
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
  });

  // Create Payment row
  const payment = await prisma.payment.create({
    data: {
      filingId: filing.id,
      userId: session.user.id,
      stripePaymentIntentId: `pi_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amountCents: breakdown.totalCents,
      status: 'SUCCEEDED',
      stateFilingFeeCents: breakdown.stateSubtotalCents,
      formationServiceFeeCents: breakdown.lines
        .filter((l) => l.category === 'service')
        .reduce((s, l) => s + l.cents, 0),
      otherServicesCents: breakdown.lines
        .filter((l) => l.category === 'addon')
        .reduce((s, l) => s + l.cents, 0),
      cardLast4: maskCardLast4(input.cardNumber),
      cardBrand: detectBrand(input.cardNumber),
      cardholderName: input.cardholderName,
      completedAt: new Date(),
    },
  });

  // Update Filing with snapshot
  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      stateFeeCents: breakdown.stateSubtotalCents,
      serviceFeeCents: payment.formationServiceFeeCents,
      addOnsTotalCents: payment.otherServicesCents,
      totalCents: breakdown.totalCents,
      completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    },
  });

  // Email confirmation
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

  // Submit to state (generates docs, marks SUBMITTED)
  await submitFilingToState(filing.id);

  revalidatePath('/dashboard');
  return { ok: true, redirectTo: `/checkout/success?filing=${filing.id}` };
}
