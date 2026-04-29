import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';

// Never statically analyse this route — it needs the Stripe key at runtime.
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/payment-intent
 *
 * Creates a Stripe PaymentIntent for the given amount.
 * Returns { clientSecret, paymentIntentId }.
 *
 * Optionally attaches a Stripe Customer so returning users can re-use
 * saved payment methods.
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const body = await request.json();
    const { amountCents, filingId, metadata = {} } = body as {
      amountCents: number;
      filingId?: string;
      metadata?: Record<string, string>;
    };

    if (!amountCents || amountCents < 50) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }

    // For authenticated users, attach/create a Stripe Customer so payment
    // methods can be saved and reused on future checkouts.
    let customerId: string | undefined;
    const session = await auth();
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true },
      });

      if (user) {
        if (user.stripeCustomerId) {
          customerId = user.stripeCustomerId;
        } else {
          // Create a new Stripe Customer and persist it
          const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim() || user.email,
            metadata: { userId: user.id },
          });
          customerId = customer.id;
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customerId },
          });
        }
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      ...(customerId ? { customer: customerId } : {}),
      automatic_payment_methods: { enabled: true },
      metadata: {
        ...(filingId ? { filingId } : {}),
        ...metadata,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('Stripe PaymentIntent error:', err);
    return NextResponse.json({ error: 'Could not create payment.' }, { status: 500 });
  }
}
