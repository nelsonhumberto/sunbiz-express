'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

const RenewSchema = z.object({
  raServiceId: z.string().min(1),
  // Real Stripe PaymentIntent confirmed on the client.
  paymentIntentId: z.string().min(1),
});

/** Advance a date by exactly one year, preserving month/day (anniversary). */
function plusOneYear(date: Date): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * Renew a Registered Agent service for another year.
 *
 * On-session, customer-present flow: the browser confirms a PaymentIntent for
 * the service's snapshotted `renewalPriceCents`, then this action verifies the
 * charge server-side, records a Payment, and advances `renewalDate` by one
 * year. Idempotent on the PaymentIntent id so a double-submit can't double
 * charge or double-extend.
 *
 * Shared by the manual "Renew now" dashboard flow. Phase 2 automatic renewal
 * will reuse the same verify-then-extend core with an off-session PaymentIntent.
 */
export async function renewRegisteredAgent(input: z.infer<typeof RenewSchema>) {
  const data = RenewSchema.parse(input);

  const limited = checkActionRateLimit('ra-renew', 10, 60 * 1000);
  if (limited) return { ok: false as const, error: limited };

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Sign in to continue.' };
  }

  const svc = await prisma.registeredAgentService.findUnique({
    where: { id: data.raServiceId },
    include: {
      filing: {
        select: {
          id: true,
          userId: true,
          businessName: true,
          user: { select: { id: true, email: true, firstName: true, stripeCustomerId: true } },
        },
      },
    },
  });
  if (!svc || svc.filing.userId !== session.user.id) {
    return { ok: false as const, error: 'Registered Agent service not found.' };
  }
  if (svc.status === 'CANCELLED') {
    return { ok: false as const, error: 'This Registered Agent service has been cancelled.' };
  }

  // Idempotency: if this PaymentIntent was already recorded, treat as success.
  const already = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: data.paymentIntentId },
    select: { id: true },
  });
  if (already) {
    revalidatePath(`/dashboard/filings/${svc.filingId}`);
    revalidatePath('/dashboard/billing');
    return { ok: true as const };
  }

  // Verify the Stripe PaymentIntent.
  let pi;
  try {
    pi = await getStripe().paymentIntents.retrieve(data.paymentIntentId, {
      expand: ['payment_method'],
    });
  } catch {
    return { ok: false as const, error: 'Could not verify payment. Please try again.' };
  }
  if (pi.status !== 'succeeded') {
    return { ok: false as const, error: `Payment not completed (${pi.status}). Please try again.` };
  }
  // The charge must match the price snapshotted on the service (grandfathered),
  // and must belong to this customer so a foreign PI id can't be replayed.
  if (Math.abs(pi.amount - svc.renewalPriceCents) > 1) {
    logger.error(
      'RA renewal amount mismatch',
      { area: 'stripe', entityId: svc.id, tag: 'ra-renew' },
      { piAmount: pi.amount, expected: svc.renewalPriceCents },
    );
    return { ok: false as const, error: 'Payment amount mismatch. Please contact support.' };
  }
  const piCustomer = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;
  if (
    svc.filing.user.stripeCustomerId &&
    piCustomer &&
    piCustomer !== svc.filing.user.stripeCustomerId
  ) {
    return { ok: false as const, error: 'Payment could not be verified. Please contact support.' };
  }

  const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
  const cardLast4 = pm?.card?.last4 ?? null;
  const cardBrand = pm?.card?.brand
    ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
    : null;
  const cardholderName = pm?.billing_details?.name ?? null;
  const pmId = typeof pm === 'string' ? pm : pm?.id ?? null;

  const newRenewalDate = plusOneYear(svc.renewalDate);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          filingId: svc.filingId,
          userId: svc.filing.user.id,
          stripePaymentIntentId: pi.id,
          stripePaymentMethodId: pmId,
          amountCents: pi.amount,
          status: 'SUCCEEDED',
          registeredAgentY1Cents: svc.renewalPriceCents,
          cardLast4,
          cardBrand,
          cardholderName,
          completedAt: new Date(),
        },
      });

      await tx.registeredAgentService.update({
        where: { id: svc.id },
        data: {
          renewalDate: newRenewalDate,
          status: 'ACTIVE',
          renewalAttempts: 0,
          lastRenewalError: null,
        },
      });
    });
  } catch {
    return { ok: false as const, error: 'Something went wrong recording your renewal. Please contact support.' };
  }

  // Receipt (best-effort — never fail the renewal on email trouble).
  try {
    await sendEmail({
      type: 'RA_RENEWED',
      to: svc.filing.user.email,
      userId: svc.filing.user.id,
      filingId: svc.filingId,
      context: {
        firstName: svc.filing.user.firstName,
        businessName: svc.filing.businessName ?? undefined,
        totalCents: svc.renewalPriceCents,
        dueDate: newRenewalDate,
      },
    });
  } catch (err) {
    logger.error('RA renewal receipt email failed', { area: 'email', entityId: svc.id }, err);
  }

  revalidatePath(`/dashboard/filings/${svc.filingId}`);
  revalidatePath('/dashboard/billing');
  revalidatePath('/dashboard');
  return { ok: true as const };
}
