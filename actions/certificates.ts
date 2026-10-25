'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { isTestPayment } from '@/lib/payment-test';
import { ADD_ON_BY_SLUG, snapshotAddOnPriceCents } from '@/lib/pricing';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { getStripe } from '@/lib/stripe';
import {
  CERTIFICATE_DOCUMENT_TYPE,
  CERTIFICATE_ORDER_PURPOSE,
  certificateEntityExists,
  certificateOffer,
  certificateOrderPath,
  certificateOrderQuote,
  filingEntityType,
  filingFormationState,
  isCertificateAddOnSlug,
  type CertificateAddOnSlug,
} from '@/lib/certificate-addons';

const PurchaseSchema = z.object({
  filingId: z.string().min(1),
  slug: z.string().refine(isCertificateAddOnSlug, { message: 'Unknown certificate.' }),
  paymentIntentId: z.string().min(1),
});

/**
 * Record a dashboard order for a certificate of status or a certified copy.
 * The browser confirms a PaymentIntent created for this filing and slug.
 * Idempotent on the PaymentIntent id. A verified charge that can no longer
 * be granted is refunded.
 */
export async function purchaseCertificateAddOn(
  input: z.infer<typeof PurchaseSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = PurchaseSchema.parse(input);
  const slug = data.slug as CertificateAddOnSlug;

  const limited = checkActionRateLimit('certificate-order', 10, 60 * 1000);
  if (limited) return { ok: false, error: limited };

  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Sign in to continue.' };

  const filing = await prisma.filing.findUnique({
    where: { id: data.filingId },
    select: {
      id: true,
      userId: true,
      status: true,
      serviceTier: true,
      filingSource: true,
      entityType: true,
      state: true,
      businessName: true,
      locale: true,
      filingAdditionalServices: { select: { service: { select: { serviceSlug: true } } } },
      documents: { select: { documentType: true, pendingState: true } },
      user: {
        select: { id: true, email: true, firstName: true, locale: true, stripeCustomerId: true },
      },
    },
  });
  if (!filing || filing.userId !== session.user.id) {
    return { ok: false, error: 'Company not found.' };
  }

  const orderPath = certificateOrderPath(filing.id, slug);
  const revalidate = () => {
    revalidatePath(`/dashboard/filings/${filing.id}`);
    revalidatePath(orderPath);
    revalidatePath('/dashboard/documents');
    revalidatePath('/dashboard/billing');
  };

  const already = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: data.paymentIntentId },
    select: { id: true },
  });
  if (already) {
    revalidate();
    return { ok: true };
  }

  const entityType = filingEntityType(filing.entityType);
  const state = filingFormationState(filing.state);
  const quote = certificateOrderQuote(slug, entityType, state);

  const stripe = getStripe();
  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(data.paymentIntentId, { expand: ['payment_method'] });
  } catch {
    return { ok: false, error: 'Could not verify payment. Please try again.' };
  }
  if (pi.status !== 'succeeded') {
    return { ok: false, error: `Payment not completed (${pi.status}). Please try again.` };
  }
  if (
    pi.metadata?.purpose !== CERTIFICATE_ORDER_PURPOSE ||
    pi.metadata.addOnSlug !== slug ||
    pi.metadata.filingId !== filing.id ||
    pi.metadata.userId !== session.user.id
  ) {
    return { ok: false, error: 'Payment could not be verified. Please contact support.' };
  }
  const piCustomer = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;
  if (filing.user.stripeCustomerId && piCustomer && piCustomer !== filing.user.stripeCustomerId) {
    return { ok: false, error: 'Payment could not be verified. Please contact support.' };
  }
  if (Math.abs(pi.amount - quote.totalCents) > 1) {
    logger.error(
      'Certificate order amount mismatch',
      { area: 'stripe', entityId: filing.id, tag: 'certificate-order' },
      { piAmount: pi.amount, expected: quote.totalCents, slug },
    );
    return { ok: false, error: 'Payment amount mismatch. Please contact support.' };
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
    try {
      await stripe.refunds.create({ payment_intent: pi.id });
    } catch (err) {
      logger.error(
        'Certificate order refund failed',
        { area: 'stripe', entityId: filing.id, tag: 'certificate-order' },
        err,
      );
      return {
        ok: false,
        error: 'This order could not be completed. Please contact support for a refund.',
      };
    }
    return {
      ok: false,
      error: certificateEntityExists(filing.status)
        ? 'This document is already included, so we refunded this charge.'
        : 'This document can be ordered once your company is filed. We refunded this charge.',
    };
  }

  const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
  const def = ADD_ON_BY_SLUG[slug];
  const documentType = CERTIFICATE_DOCUMENT_TYPE[slug];
  try {
    await prisma.$transaction(async (tx) => {
      const service = await tx.additionalService.upsert({
        where: { serviceSlug: slug },
        update: { serviceName: def.name },
        create: {
          serviceName: def.name,
          serviceSlug: slug,
          description: def.description,
          iconKey: def.iconKey,
          priceCents: def.priceCents,
          category: def.category,
        },
      });
      await tx.payment.create({
        data: {
          filingId: filing.id,
          userId: filing.user.id,
          stripePaymentIntentId: pi.id,
          stripePaymentMethodId: pm?.id ?? null,
          amountCents: pi.amount,
          status: 'SUCCEEDED',
          isTest: isTestPayment({ stripePaymentIntentId: pi.id, livemode: pi.livemode }),
          stateFilingFeeCents: quote.stateFeeCents,
          certificatesCopiesCents: quote.serviceCents,
          cardLast4: pm?.card?.last4 ?? null,
          cardBrand: pm?.card?.brand
            ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
            : null,
          cardholderName: pm?.billing_details?.name ?? null,
          completedAt: new Date(),
        },
      });
      await tx.filingAdditionalService.create({
        data: {
          filingId: filing.id,
          serviceId: service.id,
          priceCents: snapshotAddOnPriceCents({
            slug,
            dbPriceCents: service.priceCents,
            entityType,
            state,
          }),
          status: 'ACTIVE',
          purchasedAt: new Date(),
        },
      });
      const existingDoc = await tx.document.findFirst({
        where: { filingId: filing.id, documentType },
        select: { id: true },
      });
      if (!existingDoc) {
        await tx.document.create({
          data: {
            filingId: filing.id,
            documentType,
            title: slug === 'cert_status' ? 'Certificate of Status' : 'Certified Copy of Articles',
            base64: '',
            mimeType: 'application/pdf',
            fileSizeBytes: 0,
            pendingState: true,
          },
        });
      }
      // Surface the new order at the top of the admin filings list without
      // rewriting any customer-entered notes.
      await tx.$executeRaw`UPDATE "Filing" SET "updatedAt" = NOW() WHERE "id" = ${filing.id}`;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(',')
        : String(err.meta?.target ?? '');
      if (target.includes('stripePaymentIntentId')) {
        revalidate();
        return { ok: true };
      }
      try {
        await stripe.refunds.create({ payment_intent: pi.id });
      } catch (refundErr) {
        logger.error(
          'Certificate order duplicate refund failed',
          { area: 'stripe', entityId: filing.id, tag: 'certificate-order' },
          refundErr,
        );
        return {
          ok: false,
          error: 'This order could not be completed. Please contact support for a refund.',
        };
      }
      return {
        ok: false,
        error: 'This document is already included, so we refunded this charge.',
      };
    }
    logger.error(
      'Certificate order record failed',
      { area: 'certificates', entityId: filing.id, tag: 'certificate-order' },
      err,
    );
    return { ok: false, error: 'Something went wrong recording your order. Please contact support.' };
  }

  const locale =
    filing.locale === 'es' || filing.locale === 'en'
      ? filing.locale
      : filing.user.locale === 'es'
        ? 'es'
        : 'en';
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
    await sendEmail({
      type: 'CERTIFICATE_ORDERED',
      to: filing.user.email,
      userId: filing.user.id,
      filingId: filing.id,
      context: {
        firstName: filing.user.firstName,
        businessName: filing.businessName ?? undefined,
        locale,
        certificateSlug: slug,
        serviceCents: quote.serviceCents,
        stateFeeCents: quote.stateFeeCents,
        totalCents: quote.totalCents,
        resumeUrl: `${siteUrl}/dashboard/filings/${filing.id}`,
      },
    });
  } catch (err) {
    logger.error('Certificate order receipt email failed', { area: 'email', entityId: filing.id }, err);
  }

  revalidate();
  return { ok: true };
}
