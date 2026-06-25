import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { submitFilingToState } from '@/actions/filings';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// The webhook is a BACKSTOP, not the primary path. The wizard's processCheckout
// finalizes within seconds (records payment, submits, and for guests converts
// the account + signs in). We give that flow a grace window before the webhook
// acts, so the backstop only fires when the normal flow genuinely failed.
const BACKSTOP_GRACE_MS = 3 * 60 * 1000;

/**
 * Stripe webhook — reliability backstop for "paid but not submitted".
 *
 * Normally the wizard calls `processCheckout` right after the card confirms,
 * which records the Payment and submits the filing. But if the customer's
 * browser dies between a successful charge and that call, the money is taken
 * yet the filing never submits. Stripe re-delivers `payment_intent.succeeded`
 * here so we can reconcile: record the Payment and finalize the submission.
 *
 * Idempotent — keyed on the PaymentIntent id (unique on Payment), so it's
 * safe whether processCheckout already ran or not.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured yet. Acknowledge so Stripe doesn't pile up retries, but
    // never act on an unverified event.
    return NextResponse.json({ received: true, skipped: 'no_webhook_secret' });
  }

  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    logger.error(
      'stripe webhook signature verification failed',
      { area: 'stripe', tag: 'webhook-verify' },
      err,
    );
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const outcome = await reconcilePaidFiling(event.data.object as Stripe.PaymentIntent);
      if (outcome === 'defer') {
        // Too soon — let the client checkout finish. Non-2xx makes Stripe
        // redeliver later; by then processCheckout has either completed
        // (webhook no-ops) or genuinely failed (webhook finalizes).
        return NextResponse.json({ deferred: true }, { status: 425 });
      }
    }
  } catch (err) {
    logger.error(
      'stripe webhook handler error',
      { area: 'stripe', tag: 'webhook-handler' },
      err,
    );
    // 500 → Stripe retries with backoff.
    return NextResponse.json({ error: 'handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function reconcilePaidFiling(pi: Stripe.PaymentIntent): Promise<'done' | 'defer' | 'noop'> {
  const filingId = pi.metadata?.filingId;
  if (!filingId) return 'noop'; // not a formation checkout

  // Already recorded by processCheckout (or a prior webhook delivery)? Done.
  const existing = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });
  if (existing) return 'noop';

  const filing = await prisma.filing.findUnique({ where: { id: filingId } });
  if (!filing) return 'noop';
  // Only reconcile drafts — submitted/approved filings are already finalized.
  if (filing.status !== 'DRAFT') return 'noop';

  // Backstop grace: if the charge just happened, defer to the client checkout
  // (processCheckout) which also converts guests + signs them in. Only act once
  // enough time has passed that the normal flow clearly didn't finish.
  const piAgeMs = Date.now() - (pi.created ?? 0) * 1000;
  if (piAgeMs < BACKSTOP_GRACE_MS) return 'defer';

  const amountCents = pi.amount_received || pi.amount || filing.totalCents;

  // Best-effort card metadata from the charge.
  let cardLast4: string | null = null;
  let cardBrand: string | null = null;
  try {
    if (pi.latest_charge) {
      const charge = await getStripe().charges.retrieve(pi.latest_charge as string);
      cardLast4 = charge.payment_method_details?.card?.last4 ?? null;
      const brand = charge.payment_method_details?.card?.brand;
      cardBrand = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : null;
    }
  } catch {
    /* non-fatal — record the payment without card details */
  }

  logger.warn(
    'reconciling paid-but-unsubmitted filing via webhook',
    { area: 'stripe', entityId: filingId, tag: 'webhook-reconcile' },
  );

  try {
    await prisma.payment.create({
      data: {
        filingId: filing.id,
        userId: filing.userId,
        stripePaymentIntentId: pi.id,
        stripeChargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
        amountCents,
        status: 'SUCCEEDED',
        stateFilingFeeCents: filing.stateFeeCents,
        formationServiceFeeCents: filing.serviceFeeCents,
        otherServicesCents: filing.addOnsTotalCents,
        cardLast4,
        cardBrand,
        completedAt: new Date(),
      },
    });
  } catch (err: unknown) {
    // Unique-constraint race with processCheckout → already handled elsewhere.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002') {
      return 'noop';
    }
    throw err;
  }

  await prisma.filing.update({
    where: { id: filing.id },
    data: {
      totalCents: amountCents,
      completedSteps: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    },
  });

  // Confirmation email (best-effort).
  try {
    const user = await prisma.user.findUnique({
      where: { id: filing.userId },
      select: { email: true },
    });
    if (user?.email) {
      await sendEmail({
        type: 'PAYMENT_CONFIRMATION',
        to: user.email,
        userId: filing.userId,
        filingId: filing.id,
        context: { businessName: filing.businessName ?? '', totalCents: amountCents },
      });
    }
  } catch {
    /* non-fatal */
  }

  // Generate documents + move the filing to SUBMITTED.
  await submitFilingToState(filing.id, { skipAuth: true });

  // Guest conversion: the client checkout normally turns a guest into a real
  // account (and signs them in). Since the backstop ran instead, convert the
  // guest here and email credentials so the buyer can sign in and access their
  // filing — otherwise they're locked out of the account-only dashboard.
  try {
    const owner = await prisma.user.findUnique({
      where: { id: filing.userId },
      select: { accountStatus: true, email: true, firstName: true },
    });
    if (owner?.accountStatus === 'GUEST' && owner.email) {
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      await prisma.user.update({
        where: { id: filing.userId },
        data: { passwordHash, accountStatus: 'ACTIVE', guestToken: null },
      });
      await sendEmail({
        type: 'WELCOME',
        to: owner.email,
        userId: filing.userId,
        context: { firstName: owner.firstName ?? undefined, tempPassword, loginEmail: owner.email },
      });
    }
  } catch (err) {
    logger.error('webhook guest conversion failed', { area: 'stripe', entityId: filing.id, tag: 'webhook-guest-convert' }, err);
  }

  return 'done';
}

function generateTempPassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = lower + upper + digits + symbols;
  const pick = (s: string) => s[crypto.randomInt(0, s.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 10 }, () => pick(all));
  return [...required, ...rest].sort(() => crypto.randomInt(0, 2) - 0.5).join('');
}
