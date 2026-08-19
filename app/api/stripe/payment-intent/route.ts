import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getWizardActor } from '@/lib/guest';
import { safeParseJson } from '@/lib/utils';
import {
  computeCost,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// Never statically analyse this route - it needs the Stripe key at runtime.
export const dynamic = 'force-dynamic';

function asStateCode(input: string | null | undefined): StateCode {
  const upper = (input ?? 'FL').toUpperCase();
  return ACTIVE_FORMATION_STATES.includes(upper as StateCode) ? (upper as StateCode) : 'FL';
}

/**
 * POST /api/stripe/payment-intent
 *
 * Creates a Stripe PaymentIntent for a filing checkout.
 *
 * Hardened against card-testing and amount tampering:
 *  - requires an authenticated user OR an active guest session,
 *  - rate-limited per IP,
 *  - when a filingId is supplied, verifies ownership and computes the expected
 *    amount SERVER-SIDE - the client-supplied amount may only be ≤ that total
 *    (coupons reduce it; it can never inflate or undercut beyond the discount).
 */
export async function POST(request: NextRequest) {
  // Rate limit PI creation hard - this is the classic card-testing surface.
  const limit = rateLimit(`payment-intent:${clientIp()}`, 10, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment.' },
      { status: 429 },
    );
  }

  try {
    const stripe = getStripe();
    const body = await request.json();
    const { amountCents, filingId } = body as {
      amountCents: number;
      filingId?: string;
      metadata?: Record<string, string>;
    };

    if (!amountCents || amountCents < 50) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }

    // Must be a known actor (real user or guest with a cookie). No anonymous PIs.
    const session = await auth();
    const actor = await getWizardActor(session?.user?.id, session?.user?.email);
    if (!actor) {
      return NextResponse.json({ error: 'Please start a filing first.' }, { status: 401 });
    }

    // When tied to a filing: verify ownership and bound the amount to the
    // server-computed total so the client can't mint arbitrary charges.
    let verifiedFilingId: string | undefined;
    if (filingId) {
      const filing = await prisma.filing.findUnique({
        where: { id: filingId },
        include: { filingAdditionalServices: { include: { service: true } } },
      });
      if (!filing || filing.userId !== actor.id) {
        return NextResponse.json({ error: 'Filing not found.' }, { status: 404 });
      }
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
        addOnSlugs: filing.filingAdditionalServices.map(
          (fas) => fas.service.serviceSlug as AddOnSlug,
        ),
        state: asStateCode(filing.state),
        processingOptionId,
      });
      // Allow the requested amount only up to the computed total (+1c rounding).
      // Coupons reduce the amount client-side; processCheckout re-verifies the
      // exact discounted total before finalizing.
      if (amountCents > breakdown.totalCents + 1) {
        logger.error(
          'payment-intent amount exceeds computed total',
          { area: 'stripe', entityId: filing.id, tag: 'pi-amount' },
          { amountCents, computed: breakdown.totalCents },
        );
        return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
      }
      verifiedFilingId = filing.id;
    }

    // Attach/create a Stripe Customer for authed users so saved methods reuse.
    let customerId: string | undefined;
    if (actor.kind === 'user') {
      const user = await prisma.user.findUnique({
        where: { id: actor.id },
        select: { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true },
      });
      if (user) {
        if (user.stripeCustomerId) {
          customerId = user.stripeCustomerId;
        } else {
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
      // Attach the Customer AND flag the card for future off-session reuse so
      // Registered Agent renewals (and other post-checkout charges) can bill
      // the saved method. Guests have no Customer, and Stripe rejects
      // setup_future_usage without one - so only set both together.
      ...(customerId
        ? { customer: customerId, setup_future_usage: 'off_session' as const }
        : {}),
      automatic_payment_methods: { enabled: true },
      // Metadata is set server-side only - never trust client metadata here.
      metadata: {
        ...(verifiedFilingId ? { filingId: verifiedFilingId } : {}),
        userId: actor.id,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    logger.error('Stripe PaymentIntent error', { area: 'stripe', tag: 'payment-intent' }, err);
    return NextResponse.json({ error: 'Could not create payment.' }, { status: 500 });
  }
}
