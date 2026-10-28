import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { submitFilingToState } from '@/actions/filings';
import { notifyAdminOfPaidOrder } from '@/lib/paid-order-alert';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { assertFilingReadyForSubmission } from '@/lib/filing-readiness';
import { isTestPayment } from '@/lib/payment-test';
import { capturePurchaseCompletedServer } from '@/lib/posthog-server';
import { isInternalTrafficUser } from '@/lib/internal-traffic';
import { formatStripeWebhookLog } from '@/lib/stripe-webhook-log';
import { planWebhookPaidReplay } from '@/lib/guest-checkout';
import { claimPaidGuestAccount } from '@/lib/guest-checkout-claim';

export const dynamic = 'force-dynamic';

// The webhook is a BACKSTOP, not the primary path. The wizard's processCheckout
// finalizes within seconds (records payment, submits, and for guests converts
// the account + signs in). We give that flow a grace window before the webhook
// acts, so the backstop only fires when the normal flow genuinely failed.
const BACKSTOP_GRACE_MS = 3 * 60 * 1000;

function logStripeWebhook(type: string, id: string, outcome: string) {
  // One line per delivery. The formatter drops secrets and addresses.
  logger.info(formatStripeWebhookLog({ type, id, outcome }), {
    area: 'stripe',
    tag: 'webhook',
  });
}

/**
 * Stripe webhook - reliability backstop for "paid but not submitted".
 *
 * Normally the wizard calls `processCheckout` right after the card confirms,
 * which records the Payment and submits the filing. But if the customer's
 * browser dies between a successful charge and that call, the money is taken
 * yet the filing never submits. Stripe re-delivers `payment_intent.succeeded`
 * here so we can reconcile: record the Payment and finalize the submission.
 *
 * Idempotent - keyed on the PaymentIntent id (unique on Payment), so it's
 * safe whether processCheckout already ran or not.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Not configured yet. Acknowledge so Stripe doesn't pile up retries, but
    // never act on an unverified event.
    logStripeWebhook('unknown', 'none', 'skipped_no_secret');
    return NextResponse.json({ received: true, skipped: 'no_webhook_secret' });
  }

  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    logStripeWebhook('unknown', 'none', 'invalid_signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let outcome = 'ignored';
  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const reconciled = await reconcilePaidFiling(pi);
      if (reconciled === 'defer') {
        // Too soon - let the client checkout finish. Non-2xx makes Stripe
        // redeliver later; by then processCheckout has either completed
        // (webhook no-ops) or genuinely failed (webhook finalizes).
        logStripeWebhook(event.type, event.id, 'deferred');
        return NextResponse.json({ deferred: true }, { status: 425 });
      }
      outcome = reconciled === 'done' ? 'reconciled' : 'noop';
    }
  } catch {
    logStripeWebhook(event.type, event.id, 'error');
    // 500 → Stripe retries with backoff. The error object stays off the log.
    return NextResponse.json({ error: 'handler error' }, { status: 500 });
  }

  logStripeWebhook(event.type, event.id, outcome);
  return NextResponse.json({ received: true });
}

async function reconcilePaidFiling(pi: Stripe.PaymentIntent): Promise<'done' | 'defer' | 'noop'> {
  const filingId = pi.metadata?.filingId;
  if (!filingId) return 'noop'; // not a formation checkout

  // Already recorded by processCheckout (or a prior webhook delivery)?
  // Do not insert again. Claim only if that payer is still a guest, so a
  // crash between the insert and the account email can finish, and a repeat
  // after a successful claim does not send a second set-password email.
  const existing = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });
  if (existing) {
    await claimGuestPaymentAccount(existing.userId, existing.filingId, true);
    return 'noop';
  }

  const filing = await prisma.filing.findUnique({ where: { id: filingId } });
  if (!filing) return 'noop';
  // Only reconcile drafts - submitted/approved filings are already finalized.
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
    /* non-fatal - record the payment without card details */
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
        isTest: isTestPayment({ stripePaymentIntentId: pi.id, livemode: pi.livemode }),
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

  // This insert is the filing's transition to paid. A retry that lost the
  // unique PaymentIntent race returned above and does not capture again.
  const buyer = await prisma.user.findUnique({
    where: { id: filing.userId },
    select: { role: true, email: true },
  });
  await capturePurchaseCompletedServer(pi, { internal: isInternalTrafficUser(buyer) });

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

  await notifyAdminOfPaidOrder(filing.id);

  // Apply the SAME completeness + EIN gate the wizard's processCheckout uses,
  // so the backstop can never submit a half-finished draft (blank documents).
  const readiness = await assertFilingReadyForSubmission(filing.id);
  if (!readiness.ok) {
    logger.error(
      'webhook: paid filing is incomplete - recorded payment, skipped submission',
      { area: 'stripe', entityId: filing.id, tag: 'webhook-incomplete' },
      readiness.error,
    );
    // Still convert the guest below so the buyer can sign in and finish.
  } else {
    // Generate documents + move the filing to SUBMITTED.
    await submitFilingToState(filing.id, { skipAuth: true });
  }

  // The browser checkout normally claims the guest. If it never ran, claim
  // here and email the set-password link. No session is created from the
  // webhook, and a non-guest owner is left alone.
  await claimGuestPaymentAccount(filing.userId, filing.id, false);

  return 'done';
}

async function claimGuestPaymentAccount(
  userId: string,
  filingId: string,
  paymentAlreadyRecorded: boolean,
) {
  try {
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { accountStatus: true },
    });
    const plan = planWebhookPaidReplay({
      paymentAlreadyRecorded,
      accountStatus: owner?.accountStatus,
    });
    if (!plan.claimAccount) return;
    const filing = await prisma.filing.findUnique({
      where: { id: filingId },
      select: { locale: true },
    });
    await claimPaidGuestAccount({
      userId,
      filingId,
      locale: filing?.locale,
    });
  } catch (err) {
    logger.error(
      'webhook guest conversion failed',
      { area: 'stripe', entityId: filingId, tag: 'webhook-guest-convert' },
      err,
    );
  }
}
