import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getWizardActor } from '@/lib/guest';
import { CHECKOUT_ACCOUNT_REQUIRED, checkoutAllowsPayment } from '@/lib/guest-identity';
import { safeParseJson } from '@/lib/utils';
import {
  computeCost,
  tierBundledStateFeeCents,
  type AddOnSlug,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import {
  CERTIFICATE_ORDER_PURPOSE,
  certificateOffer,
  certificateOrderQuote,
  filingEntityType,
  filingFormationState,
  isCertificateAddOnSlug,
} from '@/lib/certificate-addons';
import {
  CHECKOUT_BELOW_STATE_FEE_ERROR,
  checkoutBelowStateFee,
} from '@/lib/checkout-guard';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getServerUtmAttribution } from '@/lib/utm-server';
import { checkoutAttributionMetadata } from '@/lib/checkout-attribution';
import {
  distinctIdFromPosthogCookie,
  posthogPersistenceCookieName,
  sanitizeDistinctId,
} from '@/lib/posthog-distinct-id';
import {
  isReusablePaymentIntentStatus,
  planCheckoutPaymentIntent,
  checkoutPaymentIntentIdempotencyKey,
} from '@/lib/checkout-payment-intent';

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
    const { amountCents, filingId, posthogDistinctId, certificateSlug } = body as {
      amountCents: number;
      filingId?: string;
      /** Browser PostHog distinct id. The only client field copied onto the PI. */
      posthogDistinctId?: string;
      /** Dashboard certificate order. Priced server-side, not as formation checkout. */
      certificateSlug?: string;
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
    if (!checkoutAllowsPayment(actor.kind)) {
      return NextResponse.json({ error: CHECKOUT_ACCOUNT_REQUIRED }, { status: 403 });
    }

    if (isCertificateAddOnSlug(certificateSlug)) {
      return createCertificatePaymentIntent({
        stripe,
        actorId: actor.id,
        amountCents,
        filingId,
        slug: certificateSlug,
        posthogDistinctId,
      });
    }

    // When tied to a filing: verify ownership and bound the amount to the
    // server-computed total so the client can't mint arbitrary charges.
    let verifiedFilingId: string | undefined;
    let storedCheckoutPaymentIntentId: string | null = null;
    let attributionFiling: {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmContent: string | null;
      utmTerm: string | null;
    } | null = null;
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
      const stateFeeMinimum = tierBundledStateFeeCents(
        filing.serviceTier as TierSlug,
        filing.entityType as EntityType,
        asStateCode(filing.state),
      );
      if (checkoutBelowStateFee({ totalCents: amountCents, stateFeeCents: stateFeeMinimum })) {
        logger.error(
          'payment-intent amount below tier state fee',
          { area: 'stripe', entityId: filing.id, tag: 'pi-amount-min' },
          { amountCents, stateFeeMinimum },
        );
        return NextResponse.json({ error: CHECKOUT_BELOW_STATE_FEE_ERROR }, { status: 400 });
      }
      verifiedFilingId = filing.id;
      storedCheckoutPaymentIntentId = filing.checkoutPaymentIntentId;
      attributionFiling = filing;
    }

    // UTMs come from the lf_utm cookie (set by middleware), not from the
    // client body. The PostHog distinct id only exists in the browser, so we
    // accept that one field after sanitizing, and fall back to the posthog-js
    // persistence cookie when the client didn't send it.
    let cookieUtm: ReturnType<typeof getServerUtmAttribution> = null;
    let cookieDistinctId: string | null = null;
    try {
      cookieUtm = getServerUtmAttribution();
      const cookieName = posthogPersistenceCookieName(process.env.NEXT_PUBLIC_POSTHOG_KEY);
      if (cookieName) {
        cookieDistinctId = distinctIdFromPosthogCookie(cookies().get(cookieName)?.value);
      }
    } catch (err) {
      logger.warn('payment-intent attribution unavailable', {
        area: 'stripe',
        tag: 'pi-attribution',
        message: err instanceof Error ? err.message : String(err),
      });
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

    const intentParams = {
      amount: amountCents,
      currency: 'usd' as const,
      // Attach the Customer AND flag the card for future off-session reuse so
      // Registered Agent renewals (and other post-checkout charges) can bill
      // the saved method. Guests have no Customer, and Stripe rejects
      // setup_future_usage without one - so only set both together.
      ...(customerId
        ? { customer: customerId, setup_future_usage: 'off_session' as const }
        : {}),
      automatic_payment_methods: { enabled: true },
      // Metadata is set server-side. Client `metadata` is ignored. UTMs are
      // copied from the visitor cookie (filing columns fill gaps) and the
      // PostHog distinct id is the sanitized browser value.
      metadata: {
        ...(verifiedFilingId ? { filingId: verifiedFilingId } : {}),
        userId: actor.id,
        ...checkoutAttributionMetadata({
          cookie: cookieUtm,
          filing: attributionFiling,
          posthogDistinctId: sanitizeDistinctId(posthogDistinctId) ?? cookieDistinctId,
        }),
      },
    };

    const paymentIntent = await resolveCheckoutPaymentIntent({
      stripe,
      filingId: verifiedFilingId,
      storedPaymentIntentId: storedCheckoutPaymentIntentId,
      amountCents,
      intentParams,
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

/**
 * Reuse the filing's open PaymentIntent when Stripe still accepts it, updating
 * the amount if the total changed. Otherwise create one, keyed by filing id
 * and amount so a retry does not mint a second intent.
 */
async function resolveCheckoutPaymentIntent(input: {
  stripe: Stripe;
  filingId?: string;
  storedPaymentIntentId: string | null;
  amountCents: number;
  intentParams: Stripe.PaymentIntentCreateParams;
}): Promise<Stripe.PaymentIntent> {
  const { stripe, filingId, amountCents, intentParams } = input;

  if (filingId && input.storedPaymentIntentId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(input.storedPaymentIntentId);
      const plan = planCheckoutPaymentIntent({
        filingId,
        amountCents,
        storedPaymentIntentId: existing.id,
        storedStatus: existing.status,
        storedAmount: existing.amount,
      });
      if (plan.action === 'reuse') {
        if (!plan.updateAmount) return existing;
        return await stripe.paymentIntents.update(existing.id, { amount: amountCents });
      }
    } catch {
      logger.warn('checkout payment intent reuse failed', {
        area: 'stripe',
        tag: 'pi-reuse',
        entityId: filingId,
      });
    }
  }

  const idempotencyKey = filingId
    ? checkoutPaymentIntentIdempotencyKey(
        filingId,
        amountCents,
        input.storedPaymentIntentId,
      )
    : undefined;

  let created = await stripe.paymentIntents.create(
    intentParams,
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  // A repeat of the same filing and amount can replay a finished intent.
  if (filingId && !isReusablePaymentIntentStatus(created.status)) {
    created = await stripe.paymentIntents.create(intentParams, {
      idempotencyKey: checkoutPaymentIntentIdempotencyKey(filingId, amountCents, created.id),
    });
  }

  if (filingId) {
    await prisma.filing.update({
      where: { id: filingId },
      data: { checkoutPaymentIntentId: created.id },
    });
  }
  return created;
}

/**
 * PaymentIntent for a dashboard certificate of status or certified copy.
 * The amount is the catalog service fee plus that filing's state fee.
 * This does not reuse or replace the formation checkout PaymentIntent.
 */
async function createCertificatePaymentIntent(input: {
  stripe: Stripe;
  actorId: string;
  amountCents: number;
  filingId?: string;
  slug: 'cert_status' | 'cert_copy';
  posthogDistinctId?: string;
}) {
  const { stripe, actorId, amountCents, filingId, slug } = input;
  if (!filingId) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      documents: { select: { documentType: true, pendingState: true } },
    },
  });
  if (!filing || filing.userId !== actorId) {
    return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  }

  const offer = certificateOffer({
    slug,
    status: filing.status,
    tier: filing.serviceTier,
    filingSource: filing.filingSource,
    addOnSlugs: filing.filingAdditionalServices.map((row) => row.service.serviceSlug),
    documents: filing.documents,
  });
  if (offer.kind !== 'orderable') {
    return NextResponse.json(
      {
        error:
          offer.kind === 'included'
            ? 'This document is already included.'
            : 'This document can be ordered once your company is filed.',
      },
      { status: 400 },
    );
  }

  const entityType = filingEntityType(filing.entityType);
  const state = filingFormationState(filing.state);
  const quote = certificateOrderQuote(slug, entityType, state);
  if (Math.abs(amountCents - quote.totalCents) > 1) {
    logger.error(
      'certificate payment-intent amount mismatch',
      { area: 'stripe', entityId: filing.id, tag: 'certificate-pi' },
      { amountCents, computed: quote.totalCents, slug },
    );
    return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
  }

  let cookieUtm: ReturnType<typeof getServerUtmAttribution> = null;
  let cookieDistinctId: string | null = null;
  try {
    cookieUtm = getServerUtmAttribution();
    const cookieName = posthogPersistenceCookieName(process.env.NEXT_PUBLIC_POSTHOG_KEY);
    if (cookieName) {
      cookieDistinctId = distinctIdFromPosthogCookie(cookies().get(cookieName)?.value);
    }
  } catch (err) {
    logger.warn('certificate payment-intent attribution unavailable', {
      area: 'stripe',
      tag: 'certificate-pi',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true },
  });
  let customerId = user?.stripeCustomerId ?? undefined;
  if (user && !customerId) {
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

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: quote.totalCents,
      currency: 'usd',
      ...(customerId
        ? { customer: customerId, setup_future_usage: 'off_session' as const }
        : {}),
      automatic_payment_methods: { enabled: true },
      metadata: {
        filingId: filing.id,
        userId: actorId,
        addOnSlug: slug,
        purpose: CERTIFICATE_ORDER_PURPOSE,
        serviceCents: String(quote.serviceCents),
        stateFeeCents: String(quote.stateFeeCents),
        ...checkoutAttributionMetadata({
          cookie: cookieUtm,
          filing,
          posthogDistinctId: sanitizeDistinctId(input.posthogDistinctId) ?? cookieDistinctId,
        }),
      },
    },
    { idempotencyKey: `certificate_${filing.id}_${slug}_${quote.totalCents}`.slice(0, 255) },
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  });
}
