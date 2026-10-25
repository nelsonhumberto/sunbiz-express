'use server';

import { revalidatePath } from 'next/cache';
import { redirectLocalized } from '@/lib/locale-redirect';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWizardActor } from '@/lib/guest';
import { encryptString, decryptString } from '@/lib/encryption';
import {
  canOrderEin,
  classifyEinPathway,
  filingIncludesEin,
  lastFourDigits,
  looksLikeUsTaxId,
} from '@/lib/ein';
import { ADD_ON_BY_SLUG, snapshotAddOnPriceCents, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { getStripe } from '@/lib/stripe';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { isTestPayment } from '@/lib/payment-test';

// We never accept SSN/ITIN values shorter than 9 digits. UI must surface the
// validation error; this is the server-side defence in depth.
const SsnLikeSchema = z.string().refine(looksLikeUsTaxId, {
  message: 'SSN/ITIN must be exactly 9 digits.',
});

const UsResponsiblePartySchema = z.object({
  responsiblePartyType: z.literal('us'),
  legalName: z.string().min(1).max(255),
  title: z.string().min(1).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email(),
  taxIdType: z.enum(['SSN', 'ITIN', 'EIN']),
  taxId: SsnLikeSchema,
  consentToFile: z.literal(true, {
    errorMap: () => ({ message: 'You must authorize LaunchForma to file Form SS-4.' }),
  }),
});

const ForeignResponsiblePartySchema = z.object({
  responsiblePartyType: z.literal('foreign'),
  legalName: z.string().min(1).max(255),
  title: z.string().min(1).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email(),
  countryOfCitizenship: z.string().min(2).max(80),
  passportCountry: z.string().min(2).max(80),
  passportNumber: z.string().min(3).max(40),
  identityVerificationConsent: z.literal(true, {
    errorMap: () => ({
      message:
        'You must consent to identity verification (foreign applicants cannot use the IRS online EIN Assistant).',
    }),
  }),
  consentToFile: z.literal(true, {
    errorMap: () => ({ message: 'You must authorize LaunchForma to file Form SS-4.' }),
  }),
});

const SaveEinSchema = z
  .object({ filingId: z.string().min(1) })
  .and(z.union([UsResponsiblePartySchema, ForeignResponsiblePartySchema]));

async function getFilingForUser(filingId: string) {
  const session = await auth();
  const actor = await getWizardActor(session?.user?.id, session?.user?.email);
  if (!actor) return await redirectLocalized('/sign-in');
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
    },
  });
  if (!filing || filing.userId !== actor.id) {
    throw new Error('Filing not found');
  }
  return filing;
}

/**
 * Persist the EIN responsible-party data. Sensitive fields are encrypted
 * with `lib/encryption.ts`; the unencrypted DB row only retains a 4-digit
 * tail for admin/customer display.
 */
export async function saveEinResponsibleParty(
  input: z.infer<typeof SaveEinSchema>,
): Promise<{ ok: boolean; error?: string; status?: 'ready_online' | 'manual_foreign' }> {
  try {
    return await saveEinResponsiblePartyImpl(input);
  } catch (err) {
    // Never let an unexpected exception propagate to the React render
    // (which surfaces as the opaque "Server Components render" error in
    // production). Log on the server and return a friendly message.
    logger.error('saveEinResponsibleParty failed', {
      area: 'ein',
      entityId: input.filingId,
      tag: 'save-ein',
    }, err);
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred while saving EIN data.';
    return { ok: false, error: message };
  }
}

async function saveEinResponsiblePartyImpl(
  input: z.infer<typeof SaveEinSchema>,
): Promise<{ ok: boolean; error?: string; status?: 'ready_online' | 'manual_foreign' }> {
  const data = SaveEinSchema.parse(input);
  const filing = await getFilingForUser(data.filingId);

  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  if (
    !filingIncludesEin({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs,
      createdAt: filing.createdAt,
    })
  ) {
    return {
      ok: false,
      error: 'Order your EIN from your company dashboard first.',
    };
  }

  const status = classifyEinPathway({
    responsiblePartyType: data.responsiblePartyType,
    taxIdType: 'taxIdType' in data ? data.taxIdType : null,
  });

  // Build the encrypted payload server-side. Plaintext PII never leaves
  // this scope - only ciphertext + last-4 hits Postgres.
  const baseFields = {
    filingId: filing.id,
    responsiblePartyType: data.responsiblePartyType,
    legalName: data.legalName.trim(),
    title: data.title.trim(),
    phone: data.phone.trim(),
    email: data.email.trim().toLowerCase(),
    consentToFile: data.consentToFile,
    consentToShare: true, // implicit by submitting the wizard form
    status,
  };

  if (data.responsiblePartyType === 'us') {
    const last4 = lastFourDigits(data.taxId);
    const encrypted = encryptString(data.taxId.replace(/\D/g, ''));
    await prisma.einApplication.upsert({
      where: { filingId: filing.id },
      create: {
        ...baseFields,
        taxIdType: data.taxIdType,
        taxIdEncrypted: encrypted,
        taxIdLast4: last4,
        countryOfCitizenship: null,
        passportCountry: null,
        passportEncrypted: null,
        passportLast4: null,
        identityVerificationConsent: false,
      },
      update: {
        ...baseFields,
        taxIdType: data.taxIdType,
        taxIdEncrypted: encrypted,
        taxIdLast4: last4,
        countryOfCitizenship: null,
        passportCountry: null,
        passportEncrypted: null,
        passportLast4: null,
        identityVerificationConsent: false,
      },
    });
  } else {
    const last4 = data.passportNumber.trim().slice(-4);
    const encrypted = encryptString(data.passportNumber.trim());
    await prisma.einApplication.upsert({
      where: { filingId: filing.id },
      create: {
        ...baseFields,
        taxIdType: null,
        taxIdEncrypted: null,
        taxIdLast4: null,
        countryOfCitizenship: data.countryOfCitizenship.trim(),
        passportCountry: data.passportCountry.trim(),
        passportEncrypted: encrypted,
        passportLast4: last4,
        identityVerificationConsent: data.identityVerificationConsent,
      },
      update: {
        ...baseFields,
        taxIdType: null,
        taxIdEncrypted: null,
        taxIdLast4: null,
        countryOfCitizenship: data.countryOfCitizenship.trim(),
        passportCountry: data.passportCountry.trim(),
        passportEncrypted: encrypted,
        passportLast4: last4,
        identityVerificationConsent: data.identityVerificationConsent,
      },
    });
  }

  revalidatePath(`/dashboard/filings/${filing.id}`);
  revalidatePath(`/dashboard/filings/${filing.id}/ein`);
  return { ok: true, status };
}

/**
 * Public summary for the wizard payment gate. Does NOT include any
 * encrypted data - only labels and last-4s safe for client display.
 */
export async function getEinSummary(
  filingId: string,
): Promise<
  | { complete: false; required: boolean }
  | {
      complete: true;
      required: true;
      status: 'ready_online' | 'manual_foreign' | 'submitted' | 'delivered';
      legalName: string;
      responsiblePartyType: 'us' | 'foreign';
      taxIdLast4?: string | null;
      passportLast4?: string | null;
      countryOfCitizenship?: string | null;
    }
> {
  const filing = await getFilingForUser(filingId);
  const addOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const required = filingIncludesEin({
    tier: filing.serviceTier as TierSlug,
    addOnSlugs,
    createdAt: filing.createdAt,
  });
  if (!required) return { complete: false, required: false };
  const ein = filing.einApplication;
  if (!ein || (ein.status !== 'ready_online' && ein.status !== 'manual_foreign' && ein.status !== 'submitted' && ein.status !== 'delivered')) {
    return { complete: false, required: true };
  }
  return {
    complete: true,
    required: true,
    status: ein.status as 'ready_online' | 'manual_foreign' | 'submitted' | 'delivered',
    legalName: ein.legalName ?? '',
    responsiblePartyType: ein.responsiblePartyType as 'us' | 'foreign',
    taxIdLast4: ein.taxIdLast4,
    passportLast4: ein.passportLast4,
    countryOfCitizenship: ein.countryOfCitizenship,
  };
}

const PurchaseEinSchema = z.object({
  filingId: z.string().min(1),
  // Real Stripe PaymentIntent confirmed on the client.
  paymentIntentId: z.string().min(1),
});

/**
 * Order the EIN add-on for a formed company from the dashboard. The browser
 * confirms a PaymentIntent for the EIN price; this verifies it with Stripe
 * before recording the order. Idempotent on the PaymentIntent id. A verified
 * charge that can't be granted (already entitled, not yet approved) is
 * refunded automatically.
 */
export async function purchaseEinAddOn(
  input: z.infer<typeof PurchaseEinSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = PurchaseEinSchema.parse(input);

  const limited = checkActionRateLimit('ein-order', 10, 60 * 1000);
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
      createdAt: true,
      businessName: true,
      filingAdditionalServices: { select: { service: { select: { serviceSlug: true } } } },
      user: { select: { id: true, email: true, firstName: true, stripeCustomerId: true } },
    },
  });
  if (!filing || filing.userId !== session.user.id) {
    return { ok: false, error: 'Company not found.' };
  }

  const revalidate = () => {
    revalidatePath(`/dashboard/filings/${filing.id}`);
    revalidatePath(`/dashboard/filings/${filing.id}/ein`);
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

  const priceCents = ADD_ON_BY_SLUG.ein.serviceMarginCents;
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
  // metadata.userId is set server-side when the PaymentIntent is created, so a
  // PaymentIntent id belonging to someone else can't be replayed here.
  const piCustomer = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;
  if (
    pi.metadata?.userId !== session.user.id ||
    (filing.user.stripeCustomerId && piCustomer && piCustomer !== filing.user.stripeCustomerId)
  ) {
    return { ok: false, error: 'Payment could not be verified. Please contact support.' };
  }
  if (Math.abs(pi.amount - priceCents) > 1) {
    logger.error(
      'EIN order amount mismatch',
      { area: 'stripe', entityId: filing.id, tag: 'ein-order' },
      { piAmount: pi.amount, expected: priceCents },
    );
    return { ok: false, error: 'Payment amount mismatch. Please contact support.' };
  }

  const entitled = filingIncludesEin({
    tier: filing.serviceTier as TierSlug,
    addOnSlugs: filing.filingAdditionalServices.map((f) => f.service.serviceSlug as AddOnSlug),
    createdAt: filing.createdAt,
  });
  if (!canOrderEin({ status: filing.status, entitled })) {
    try {
      await stripe.refunds.create({ payment_intent: pi.id });
    } catch (err) {
      logger.error('EIN order refund failed', { area: 'stripe', entityId: filing.id, tag: 'ein-order' }, err);
      return { ok: false, error: 'This order could not be completed. Please contact support for a refund.' };
    }
    return {
      ok: false,
      error: entitled
        ? 'Your EIN is already included, so we refunded this charge.'
        : 'EIN can be ordered once your company is approved. We refunded this charge.',
    };
  }

  const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
  const def = ADD_ON_BY_SLUG.ein;
  try {
    await prisma.$transaction(async (tx) => {
      const service = await tx.additionalService.upsert({
        where: { serviceSlug: 'ein' },
        update: {},
        create: {
          serviceName: def.name,
          serviceSlug: 'ein',
          description: def.description,
          iconKey: def.iconKey,
          priceCents,
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
          einCents: priceCents,
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
            slug: 'ein',
            dbPriceCents: priceCents,
          }),
          status: 'ACTIVE',
          purchasedAt: new Date(),
        },
      });
    });
  } catch (err) {
    logger.error('EIN order record failed', { area: 'ein', entityId: filing.id, tag: 'ein-order' }, err);
    return { ok: false, error: 'Something went wrong recording your order. Please contact support.' };
  }

  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';
    await sendEmail({
      type: 'EIN_ORDERED',
      to: filing.user.email,
      userId: filing.user.id,
      filingId: filing.id,
      context: {
        firstName: filing.user.firstName,
        businessName: filing.businessName ?? undefined,
        totalCents: priceCents,
        resumeUrl: `${siteUrl}/dashboard/filings/${filing.id}/ein`,
      },
    });
  } catch (err) {
    logger.error('EIN order receipt email failed', { area: 'email', entityId: filing.id }, err);
  }

  revalidate();
  return { ok: true };
}

/**
 * Admin-only helper: decrypt the responsible-party tax id / passport. Rejects
 * non-admin callers. Used for IRS Form SS-4 preparation.
 */
export async function adminRevealEinSecret(
  filingId: string,
): Promise<{ ok: true; taxId?: string; passport?: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Not authenticated' };
  if (session.user.role !== 'ADMIN') return { ok: false, error: 'Forbidden' };
  const ein = await prisma.einApplication.findUnique({ where: { filingId } });
  if (!ein) return { ok: false, error: 'No EIN application' };

  // Audit every decryption (admin + filing + timestamp - never the plaintext).
  // The marketing copy promises this; it must actually happen.
  try {
    await prisma.adminAction.create({
      data: {
        adminUserId: session.user.id,
        filingId,
        actionType: 'REVEAL_EIN_SECRET',
        description: 'Decrypted responsible-party tax id / passport for SS-4 prep',
      },
    });
  } catch {
    /* never block the reveal on the audit write, but it should normally succeed */
  }

  return {
    ok: true,
    taxId: ein.taxIdEncrypted ? decryptString(ein.taxIdEncrypted) : undefined,
    passport: ein.passportEncrypted ? decryptString(ein.passportEncrypted) : undefined,
  };
}
