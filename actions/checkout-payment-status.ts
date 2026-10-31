'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { CheckoutPaymentPollResult } from '@/lib/checkout-payment-watch';

/**
 * Whether this signed-in user already has a SUCCEEDED payment on the filing.
 * Pending and not-owned both look the same. The success page polls this
 * until the Stripe webhook lands.
 */
export async function readCheckoutPaymentStatus(
  filingId: string,
): Promise<CheckoutPaymentPollResult> {
  const id = filingId.trim();
  if (!id || id.length > 200) return { status: 'pending' };
  try {
    const session = await auth();
    if (!session?.user?.id) return { status: 'pending' };
    const payment = await prisma.payment.findFirst({
      where: {
        filingId: id,
        status: 'SUCCEEDED',
        filing: { userId: session.user.id },
      },
      orderBy: { completedAt: 'desc' },
      select: { amountCents: true, currency: true, isTest: true },
    });
    if (!payment) return { status: 'pending' };
    return {
      status: 'paid',
      transactionId: id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      isTest: payment.isTest === true,
    };
  } catch {
    return { status: 'pending' };
  }
}
