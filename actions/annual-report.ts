'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS, RA_ANNUAL_SERVICE_FEE_CENTS } from '@/lib/pricing';
import { FL } from '@/lib/florida';
import {
  fetchFloridaEntityDetailByDocumentNumber,
  SunbizError,
  type FloridaEntityDetail,
} from '@/lib/sunbiz';

const AddressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(5),
});

const OfficerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  title: z.string().min(1),
});

const SubmitSchema = z.object({
  filingId: z.string().min(1),
  annualReportId: z.string().min(1),

  ein: z.string().optional(),
  registeredAgentName: z.string().min(1),
  registeredAgentAddress: AddressSchema,
  useOurRa: z.boolean(),

  principalAddress: AddressSchema,
  mailingAddress: AddressSchema,

  officers: z.array(OfficerSchema).min(1),
  signingOfficerName: z.string().min(1),

  // Real Stripe PaymentIntent confirmed on the client
  paymentIntentId: z.string().min(1),
});

// Guest schema — no auth required
const GuestSubmitSchema = SubmitSchema.omit({ filingId: true, annualReportId: true }).extend({
  documentNumber: z.string().min(1),
  guestEmail: z.string().email(),
  companyName: z.string().min(1),
  entityType: z.enum(['LLC', 'CORP']),
  reportYear: z.number().int(),
});

/** Resolve the real DB user record — tries by id first, then falls back to email. */
async function resolveUserId(
  sessionId: string,
  sessionEmail: string | null | undefined,
): Promise<string | null> {
  const byId = await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true } });
  if (byId) return byId.id;
  if (!sessionEmail) return null;
  const byEmail = await prisma.user.findUnique({
    where: { email: sessionEmail.toLowerCase().trim() },
    select: { id: true },
  });
  return byEmail?.id ?? null;
}

export async function submitAnnualReport(input: z.infer<typeof SubmitSchema>) {
  const data = SubmitSchema.parse(input);
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Sign in to continue.' };
  }

  const userId = await resolveUserId(session.user.id, session.user.email);
  if (!userId) {
    return { ok: false as const, error: 'Account not found — please sign out and back in.' };
  }

  const filing = await prisma.filing.findUnique({
    where: { id: data.filingId },
    select: { id: true, userId: true, entityType: true, businessName: true },
  });
  if (!filing || filing.userId !== userId) {
    return { ok: false as const, error: 'Filing not found.' };
  }

  const annualReport = await prisma.annualReport.findUnique({
    where: { id: data.annualReportId },
    select: { id: true, filingId: true, status: true, reportYear: true },
  });
  if (!annualReport || annualReport.filingId !== data.filingId) {
    return { ok: false as const, error: 'Annual report not found.' };
  }
  if (annualReport.status === 'FILED') {
    return { ok: false as const, error: 'This annual report has already been filed.' };
  }

  // Verify the Stripe PaymentIntent
  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(data.paymentIntentId, {
      expand: ['payment_method'],
    });
  } catch {
    return { ok: false as const, error: 'Could not verify payment. Please try again.' };
  }
  if (pi.status !== 'succeeded') {
    return { ok: false as const, error: `Payment not completed (${pi.status}). Please try again.` };
  }

  const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
  const cardLast4 = pm?.card?.last4 ?? null;
  const cardBrand = pm?.card?.brand
    ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
    : null;
  const pmCardholderName = pm?.billing_details?.name ?? null;
  const pmId = typeof pm === 'string' ? pm : pm?.id ?? null;

  const stateFee =
    filing.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp;
  const raFee = data.useOurRa ? RA_ANNUAL_SERVICE_FEE_CENTS : 0;
  const totalCents = ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFee + raFee;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.filing.update({
        where: { id: data.filingId },
        data: {
          principalAddress: JSON.stringify({
            street1: data.principalAddress.street1,
            street2: data.principalAddress.street2,
            city: data.principalAddress.city,
            state: data.principalAddress.state,
            zip: data.principalAddress.zip,
          }),
          mailingAddress: JSON.stringify({
            street1: data.mailingAddress.street1,
            street2: data.mailingAddress.street2,
            city: data.mailingAddress.city,
            state: data.mailingAddress.state,
            zip: data.mailingAddress.zip,
          }),
          registeredAgent: JSON.stringify({
            name: data.registeredAgentName,
            street1: data.registeredAgentAddress.street1,
            street2: data.registeredAgentAddress.street2,
            city: data.registeredAgentAddress.city,
            state: data.registeredAgentAddress.state,
            zip: data.registeredAgentAddress.zip,
            useOurService: data.useOurRa,
            agentCountry: 'US',
          }),
        },
      });

      const existingIds = data.officers.filter((o) => o.id).map((o) => o.id as string);
      await tx.managerMember.deleteMany({
        where: { filingId: data.filingId, id: { notIn: existingIds } },
      });
      for (let i = 0; i < data.officers.length; i++) {
        const o = data.officers[i];
        if (o.id) {
          await tx.managerMember.update({
            where: { id: o.id },
            data: { name: o.name, title: o.title, position: i },
          });
        } else {
          await tx.managerMember.create({
            data: { filingId: data.filingId, name: o.name, title: o.title, position: i },
          });
        }
      }

      await tx.annualReport.update({
        where: { id: data.annualReportId },
        data: {
          status: 'FILED',
          filedDate: new Date(),
          filingFeeCents: stateFee,
          totalCostCents: totalCents,
          notes: `Signed by: ${data.signingOfficerName}${data.useOurRa ? ' | RA service added' : ''}`,
        },
      });

      await tx.payment.create({
        data: {
          filingId: data.filingId,
          userId,
          stripePaymentIntentId: pi.id,
          stripePaymentMethodId: pmId,
          amountCents: pi.amount,
          status: 'SUCCEEDED',
          stateFilingFeeCents: stateFee,
          formationServiceFeeCents: ANNUAL_REPORT_SERVICE_FEE_CENTS,
          registeredAgentY1Cents: raFee,
          operatingAgreementCents: 0,
          einCents: 0,
          domainCents: 0,
          certificatesCopiesCents: 0,
          otherServicesCents: 0,
          cardLast4,
          cardBrand,
          cardholderName: pmCardholderName,
          completedAt: new Date(),
        },
      });
    });

    revalidatePath(`/dashboard/filings/${data.filingId}`);
    revalidatePath('/dashboard');
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'Something went wrong. Please try again.' };
  }
}

/** Public (no-auth) Sunbiz entity lookup for the guest annual report form. */
export async function lookupEntityPublic(
  documentNumber: string,
): Promise<{ ok: true; detail: FloridaEntityDetail } | { ok: false; error: string }> {
  try {
    const detail = await fetchFloridaEntityDetailByDocumentNumber(documentNumber.trim());
    return { ok: true, detail };
  } catch (err) {
    if (err instanceof SunbizError) return { ok: false, error: err.message };
    return { ok: false, error: 'Could not load that entity. Please try again.' };
  }
}

/** Guest (unauthenticated) annual report filing. Creates or reuses a guest user. */
export async function submitGuestAnnualReport(input: z.infer<typeof GuestSubmitSchema>) {
  const data = GuestSubmitSchema.parse(input);

  // Verify the Stripe PaymentIntent before touching the DB
  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(data.paymentIntentId, {
      expand: ['payment_method'],
    });
  } catch {
    return { ok: false as const, error: 'Could not verify payment. Please try again.' };
  }
  if (pi.status !== 'succeeded') {
    return { ok: false as const, error: `Payment not completed (${pi.status}). Please try again.` };
  }

  const pm = pi.payment_method as import('stripe').Stripe.PaymentMethod | null;
  const cardLast4 = pm?.card?.last4 ?? null;
  const cardBrand = pm?.card?.brand
    ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
    : null;
  const pmCardholderName = pm?.billing_details?.name ?? null;
  const pmId = typeof pm === 'string' ? pm : pm?.id ?? null;

  const stateFee =
    data.entityType === 'LLC' ? FL.fees.annualReportLLC : FL.fees.annualReportCorp;
  const raFee = data.useOurRa ? RA_ANNUAL_SERVICE_FEE_CENTS : 0;
  const totalCents = ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFee + raFee;
  const email = data.guestEmail.toLowerCase().trim();

  // Verify Stripe amount matches our expected total (±1 cent for rounding)
  if (Math.abs(pi.amount - totalCents) > 1) {
    return { ok: false as const, error: 'Payment amount mismatch. Please contact support.' };
  }

  try {
    // Find or create a guest user account by email
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const crypto = await import('crypto');
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: crypto.randomBytes(32).toString('hex'),
          firstName: 'Guest',
          lastName: '',
          emailVerified: false,
          accountStatus: 'ACTIVE',
          role: 'USER',
        },
      });
    }

    const filingId = await prisma.$transaction(async (tx) => {
      const filing = await tx.filing.create({
        data: {
          userId: user!.id,
          entityType: data.entityType,
          state: 'FL',
          businessName: data.companyName,
          filingSource: 'LINKED',
          status: 'APPROVED',
          sunbizFilingNumber: data.documentNumber,
          principalAddress: JSON.stringify(data.principalAddress),
          mailingAddress: JSON.stringify(data.mailingAddress),
          registeredAgent: JSON.stringify({
            name: data.registeredAgentName,
            ...data.registeredAgentAddress,
            useOurService: data.useOurRa,
            agentCountry: 'US',
          }),
          correspondenceContact: JSON.stringify({ email }),
          confirmationAccepted: true,
          stateFeeCents: 0,
          serviceFeeCents: 0,
          addOnsTotalCents: 0,
          totalCents: 0,
        },
      });

      for (let i = 0; i < data.officers.length; i++) {
        const o = data.officers[i];
        await tx.managerMember.create({
          data: { filingId: filing.id, name: o.name, title: o.title, position: i },
        });
      }

      const ar = await tx.annualReport.create({
        data: {
          filingId: filing.id,
          reportYear: data.reportYear,
          dueDate: new Date(`${data.reportYear}-05-01T23:59:00`),
          status: 'FILED',
          filedDate: new Date(),
          filingFeeCents: stateFee,
          totalCostCents: totalCents,
          notes: `Guest filing | Signed by: ${data.signingOfficerName}${data.useOurRa ? ' | RA added' : ''}`,
        },
      });

      await tx.payment.create({
        data: {
          filingId: filing.id,
          userId: user!.id,
          stripePaymentIntentId: pi.id,
          stripePaymentMethodId: pmId,
          amountCents: pi.amount,
          status: 'SUCCEEDED',
          stateFilingFeeCents: stateFee,
          formationServiceFeeCents: ANNUAL_REPORT_SERVICE_FEE_CENTS,
          registeredAgentY1Cents: raFee,
          operatingAgreementCents: 0,
          einCents: 0,
          domainCents: 0,
          certificatesCopiesCents: 0,
          otherServicesCents: 0,
          cardLast4,
          cardBrand,
          cardholderName: pmCardholderName,
          completedAt: new Date(),
        },
      });

      return { filingId: filing.id, arId: ar.id };
    });

    return { ok: true as const, filingId: filingId.filingId };
  } catch (e) {
    console.error('Guest annual report error:', e);
    return { ok: false as const, error: 'Something went wrong. Please try again.' };
  }
}
