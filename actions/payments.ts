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

  // Create Payment row. We still split the amount into legacy accounting
  // fields, but they now reflect the package-pricing ledger:
  //   stateFilingFeeCents      → total government remittance (filing fee +
  //                              cert pass-through fees from add-ons)
  //   formationServiceFeeCents → IncServices margin from the tier package
  //   otherServicesCents       → customer-paid add-on subtotal
  const payment = await prisma.payment.create({
    data: {
      filingId: filing.id,
      userId: session.user.id,
      stripePaymentIntentId: `pi_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amountCents: breakdown.totalCents,
      status: 'SUCCEEDED',
      stateFilingFeeCents: breakdown.governmentRemittanceCents,
      formationServiceFeeCents: breakdown.packageMarginCents,
      otherServicesCents: breakdown.addOnsCents,
      cardLast4: maskCardLast4(input.cardNumber),
      cardBrand: detectBrand(input.cardNumber),
      cardholderName: input.cardholderName,
      completedAt: new Date(),
    },
  });

  // Update Filing with the same accounting snapshot. The customer never
  // sees this split — it's used for receipts, cover letters, and revenue
  // reporting.
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
