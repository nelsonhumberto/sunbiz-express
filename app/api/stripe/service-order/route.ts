import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getStripe } from '@/lib/stripe';
import { utmToPrismaFields } from '@/lib/utm';
import { getServerUtmAttribution } from '@/lib/utm-server';
import {
  enforceServerAmount,
  priceServiceOrder,
  reinstatementInquiryMessage,
  reinstatementStripeMetadata,
  serviceOrderError,
  serviceOrderIdempotencyKey,
} from '@/lib/service-order';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/service-order
 *
 * Guest checkout for a reinstatement or a public annual report. The amount
 * is computed here. A client amount is rejected when it does not match.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`service-order:${clientIp()}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json({ error: serviceOrderError('en', 'rate') }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: serviceOrderError('en', 'invalid') }, { status: 400 });
  }

  const priced = priceServiceOrder(body);
  if (!priced.ok) {
    return NextResponse.json({ error: serviceOrderError(priced.locale, 'invalid') }, { status: 400 });
  }
  const order = priced.order;
  if (!enforceServerAmount(order.input.amountCents, order.amountCents).ok) {
    return NextResponse.json({ error: serviceOrderError(order.locale, 'amount') }, { status: 400 });
  }

  if (order.type === 'reinstatement') {
    try {
      const utm = getServerUtmAttribution();
      await prisma.serviceInquiry.create({
        data: {
          name: order.input.contactName.trim(),
          email: order.email,
          phone: order.input.phone.trim(),
          service: 'llc_reinstatement',
          message: reinstatementInquiryMessage(order),
          locale: order.locale,
          ...utmToPrismaFields(utm),
        },
      });
    } catch (err) {
      logger.error('reinstatement inquiry failed', { area: 'marketing', tag: 'service-order' }, err);
      return NextResponse.json({ error: serviceOrderError(order.locale, 'payment') }, { status: 500 });
    }
  }

  const metadata = order.type === 'reinstatement'
    ? reinstatementStripeMetadata(order.documentNumber, order.quote.years)
    : { type: 'annual-report', documentNumber: order.documentNumber };

  try {
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount: order.amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        description: order.type === 'reinstatement'
          ? `Florida LLC reinstatement ${order.documentNumber}`
          : `Florida annual report ${order.documentNumber}`,
        metadata,
      },
      {
        idempotencyKey: serviceOrderIdempotencyKey({
          type: order.type,
          documentNumber: order.documentNumber,
          amountCents: order.amountCents,
          years: order.type === 'reinstatement' ? order.quote.years : undefined,
          entityType: order.type === 'annual-report' ? order.entityType : undefined,
          useOurRa: order.type === 'annual-report' ? order.useOurRa : undefined,
          email: order.email,
        }),
      },
    );
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents: order.amountCents,
    });
  } catch (err) {
    logger.error('service-order PaymentIntent failed', { area: 'stripe', tag: 'service-order' }, err);
    return NextResponse.json({ error: serviceOrderError(order.locale, 'payment') }, { status: 500 });
  }
}
