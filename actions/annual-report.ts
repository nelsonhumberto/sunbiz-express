'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { qaMarkedFromRequest, stampQaLaunchformaGuest } from '@/lib/qa-guest';
import { filingTestCreateFields } from '@/lib/qa-marker';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { checkActionRateLimit } from '@/lib/rate-limit';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS } from '@/lib/pricing';
import { quoteAnnualReport } from '@/lib/annual-report-quote';
import { resolveGuestAnnualReportCharge } from '@/lib/guest-annual-report-charge';
import {
  DOCUMENT_NUMBER_REQUIRED,
  GUEST_LOOKUP_FAILED,
  annualReportYearsOf,
  guestAnnualReportOffer,
  guestDocumentNumberRequiredMessage,
  isMissingDocumentNumberIssue,
  pricedFloridaEntityType,
  type GuestAnnualReportOffer,
} from '@/lib/guest-annual-report-offer';
import { findSunbizArCandidate } from '@/lib/sunbiz-ar-candidate';
import { LOCALE_HEADER, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import { resolveRequestLocale } from '@/lib/request-locale';
import {
  formationStateUnavailableMessage,
  isActiveFormationState,
  type StateCode,
} from '@/lib/formation-states';
import {
  fetchFloridaEntityDetailByDocumentNumber,
  floridaLookupUsedScraper,
  searchSunbiz,
  type FloridaEntityDetail,
} from '@/lib/sunbiz';
import { logGuestAnnualReportDecision } from '@/lib/guest-annual-report-decision-log';
import { logger } from '@/lib/logger';
import { isTestPayment } from '@/lib/payment-test';
import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import { sendEmail } from '@/lib/email';
import { notifyAdminOfPaidOrder } from '@/lib/paid-order-alert';
import {
  AnnualReportDraftFields,
  annualReportSaveRetry,
  refineAnnualReportDraft,
} from '@/lib/annual-report-draft';

const SubmitFields = AnnualReportDraftFields.extend({
  filingId: z.string().min(1),
  annualReportId: z.string().min(1),
  paymentIntentId: z.string().min(1),
});

const SubmitSchema = SubmitFields.superRefine(refineAnnualReportDraft);

// Guest schema - no auth required
const GuestSubmitSchema = SubmitFields.omit({ filingId: true, annualReportId: true })
  .extend({
    documentNumber: z
      .string({
        required_error: DOCUMENT_NUMBER_REQUIRED,
        invalid_type_error: DOCUMENT_NUMBER_REQUIRED,
      })
      .trim()
      .min(1),
    guestEmail: z.string().email(),
    companyName: z.string().min(1),
    entityType: z.enum(['LLC', 'CORP']),
  })
  .superRefine(refineAnnualReportDraft);

function guestActionLocale(): 'en' | 'es' {
  try {
    const headerStore = headers();
    return (
      resolveRequestLocale({
        referer: headerStore.get('referer'),
        nextUrl: headerStore.get('next-url'),
        publicPath: headerStore.get(PUBLIC_PATH_HEADER),
        localeHeader: headerStore.get(LOCALE_HEADER),
        allowedHost: headerStore.get('host'),
        serverAction: true,
      }) ?? 'en'
    );
  } catch {
    return 'en';
  }
}

/** Resolve the real DB user record - tries by id first, then falls back to email. */
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

const RETRY_AFTER_CHARGE =
  'Your card was charged, but we could not finish saving the filing. Submit again on this page. You will not be charged twice.';

async function alertUnsavedAnnualReport(detail: string, filingId?: string) {
  logger.error('Annual report charged but not saved', {
    area: 'annual-report',
    tag: 'unsaved-charge',
    entityId: filingId,
    detail,
  });
  try {
    await sendEmail({
      type: 'ANNUAL_REPORT_UNSAVED',
      to: INQUIRY_NOTIFY_EMAIL,
      filingId,
      context: { unsavedChargeDetail: detail },
    });
  } catch (err) {
    logger.error('Admin alert for unsaved annual report failed', { area: 'annual-report' }, err);
  }
}

function paymentIntentIdFrom(input: unknown): string | null {
  if (!input || typeof input !== 'object' || !('paymentIntentId' in input)) return null;
  const value = (input as { paymentIntentId?: unknown }).paymentIntentId;
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function submitAnnualReport(input: unknown) {
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    const piId = paymentIntentIdFrom(input);
    if (piId) {
      try {
        const pi = await getStripe().paymentIntents.retrieve(piId);
        if (pi.status === 'succeeded') {
          await alertUnsavedAnnualReport(
            `Validation failed after charge ${piId}: ${parsed.error.issues[0]?.message ?? 'invalid form'}`,
          );
        }
      } catch {
        // No succeeded charge to reconcile.
      }
    }
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    };
  }
  const data = parsed.data;
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Sign in to continue.' };
  }

  const userId = await resolveUserId(session.user.id, session.user.email);
  if (!userId) {
    return { ok: false as const, error: 'Account not found - please sign out and back in.' };
  }

  const filing = await prisma.filing.findUnique({
    where: { id: data.filingId },
    select: {
      id: true,
      userId: true,
      entityType: true,
      businessName: true,
      state: true,
      locale: true,
      user: { select: { isTester: true } },
    },
  });
  if (!filing || filing.userId !== userId) {
    return { ok: false as const, error: 'Filing not found.' };
  }
  if (!isActiveFormationState(filing.state)) {
    return { ok: false as const, error: formationStateUnavailableMessage(filing.locale) };
  }
  const filingStateCode = filing.state.toUpperCase() as StateCode;

  const annualReport = await prisma.annualReport.findUnique({
    where: { id: data.annualReportId },
    select: { id: true, filingId: true, status: true, reportYear: true },
  });
  if (!annualReport || annualReport.filingId !== data.filingId) {
    return { ok: false as const, error: 'Annual report not found.' };
  }
  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: data.paymentIntentId },
    select: { id: true },
  });
  const retry = annualReportSaveRetry({
    paymentExists: !!existingPayment,
    reportFiled: annualReport.status === 'FILED',
  });
  if (retry === 'done') return { ok: true as const };
  if (retry === 'blocked') {
    return { ok: false as const, error: 'This annual report has already been filed.' };
  }

  // Verify the Stripe PaymentIntent
  let pi;
  try {
    pi = await getStripe().paymentIntents.retrieve(data.paymentIntentId, {
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

  // Recomputed on the server so the client cannot drop the Florida late fee.
  // FL LLC = $138.75, FL corp = $150, plus $400 after May 1 Eastern.
  // WY = $60 minimum; DE LLC = $300 annual tax; DE Corp = $225 minimum.
  const entityType = filing.entityType === 'CORP' ? 'CORP' : 'LLC';
  const quote = quoteAnnualReport(
    filingStateCode,
    entityType,
    data.useOurRa,
    annualReport.reportYear,
  );
  if (Math.abs(pi.amount - quote.totalCents) > 1) {
    await alertUnsavedAnnualReport(
      `Payment ${pi.id} charged ${pi.amount} cents. Server quote is ${quote.totalCents} cents. No refund was issued.`,
      data.filingId,
    );
    return { ok: false as const, error: 'Payment amount mismatch. Please contact support.' };
  }

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
          filingFeeCents: quote.filingFeeCents,
          lateFeeCents: quote.lateFeeCents,
          totalCostCents: quote.totalCents,
          notes: `Signed by: ${data.signingOfficerName}${data.useOurRa ? ' | RA service added' : ''}`,
        },
      });

      // A previous attempt already stored this PaymentIntent. Finish the
      // report on that row instead of inserting a second payment.
      if (retry !== 'finish') {
        await tx.payment.create({
          data: {
            filingId: data.filingId,
            userId,
            stripePaymentIntentId: pi.id,
            stripePaymentMethodId: pmId,
            amountCents: pi.amount,
            status: 'SUCCEEDED',
            isTest: isTestPayment({
              stripePaymentIntentId: pi.id,
              livemode: pi.livemode,
              metadata: pi.metadata,
              userIsTester: filing.user.isTester,
          }),
            stateFilingFeeCents: quote.stateFilingFeeCents,
            formationServiceFeeCents: ANNUAL_REPORT_SERVICE_FEE_CENTS,
            registeredAgentY1Cents: quote.raFee,
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
      }
    });

    revalidatePath(`/dashboard/filings/${data.filingId}`);
    revalidatePath('/dashboard');
    return { ok: true as const };
  } catch (err) {
    const saved = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: pi.id },
      select: { id: true },
    });
    const report = await prisma.annualReport.findUnique({
      where: { id: data.annualReportId },
      select: { status: true },
    });
    if (saved && report?.status === 'FILED') return { ok: true as const };
    if (saved && report && report.status !== 'FILED') {
      try {
        await prisma.annualReport.update({
          where: { id: data.annualReportId },
          data: {
            status: 'FILED',
            filedDate: new Date(),
            filingFeeCents: quote.filingFeeCents,
            lateFeeCents: quote.lateFeeCents,
            totalCostCents: quote.totalCents,
          },
        });
        return { ok: true as const };
      } catch (retryErr) {
        logger.error('Annual report retry after charge failed', { area: 'annual-report' }, retryErr);
      }
    }
    await alertUnsavedAnnualReport(
      `filing ${data.filingId} report ${data.annualReportId} payment ${pi.id}`,
      data.filingId,
    );
    logger.error('Annual report save failed after charge', { area: 'annual-report' }, err);
    return { ok: false as const, error: RETRY_AFTER_CHARGE };
  }
}

/** Public (no-auth) Sunbiz entity lookup for the guest annual report form. */
export async function lookupEntityPublic(
  documentNumber: string,
): Promise<
  | { ok: true; detail: FloridaEntityDetail; offer: GuestAnnualReportOffer }
  | { ok: false; error: typeof GUEST_LOOKUP_FAILED }
> {
  try {
    const detail = await fetchFloridaEntityDetailByDocumentNumber(documentNumber.trim());
    const candidate = await findSunbizArCandidate(documentNumber);
    const filedYears = annualReportYearsOf(detail);
    let offer = guestAnnualReportOffer({
      lookupOk: true,
      status: detail.status,
      filedYears,
      eventFiledYears: detail.event_filed_years,
      fileDate: detail.file_date,
      candidate,
    });
    if (offer.kind === 'sell' && !pricedFloridaEntityType(documentNumber, detail)) {
      offer = { kind: 'unconfirmed' };
    }
    logGuestAnnualReportDecision({
      documentNumber,
      offer,
      candidatePresent: candidate != null,
      sunbizDailyStatus: detail.status,
      scraperUsed: floridaLookupUsedScraper(detail),
      lookupOk: true,
      filedYears,
      eventFiledYears: detail.event_filed_years,
      fileDate: detail.file_date,
    });
    return { ok: true, detail, offer };
  } catch {
    const candidate = await findSunbizArCandidate(documentNumber);
    logGuestAnnualReportDecision({
      documentNumber,
      offer: { kind: 'unconfirmed' },
      candidatePresent: candidate != null,
      sunbizDailyStatus: null,
      scraperUsed: false,
      lookupOk: false,
    });
    return { ok: false, error: GUEST_LOOKUP_FAILED };
  }
}

export interface EntitySearchHit {
  name: string;
  documentNumber: string;
  status: string;
}

/**
 * Search Florida active entities by company name.
 * Returns up to 10 ACTIVE results - used by the guest annual report form
 * so visitors who don't know their document number can find their company.
 */
export async function searchEntitiesByName(
  query: string,
  options?: { includeInactive?: boolean },
): Promise<{ ok: true; results: EntitySearchHit[] } | { ok: false; error: string }> {
  if (!query.trim() || query.trim().length < 2) {
    return { ok: false, error: 'Enter at least 2 characters.' };
  }
  // Rate-limit: this hits the upstream Sunbiz API/scraper, so cap per IP to
  // stop it being used as a free scraping proxy.
  const limited = checkActionRateLimit('entity-search', 20, 60 * 1000);
  if (limited) return { ok: false, error: limited };
  try {
    const { entities } = await searchSunbiz(query.trim(), { limit: 50 });
    const rows = options?.includeInactive
      ? entities
      : entities.filter((e) => e.status === 'Active' || e.status?.toUpperCase() === 'ACTIVE');
    const results = rows.slice(0, 10).map<EntitySearchHit>((e) => ({
      name: e.name,
      documentNumber: e.documentNumber,
      status: e.status,
    }));
    return { ok: true, results };
  } catch {
    return { ok: false, error: GUEST_LOOKUP_FAILED };
  }
}

/** Guest (unauthenticated) annual report filing. Creates or reuses a guest user. */
export async function submitGuestAnnualReport(input: z.infer<typeof GuestSubmitSchema>) {
  const locale = guestActionLocale();
  const parsed = GuestSubmitSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false as const,
      error: isMissingDocumentNumberIssue(issue)
        ? guestDocumentNumberRequiredMessage(locale)
        : issue?.message ?? 'Check the form and try again.',
    };
  }
  const data = parsed.data;

  // Verify the Stripe PaymentIntent before touching the DB
  let pi;
  try {
    pi = await getStripe().paymentIntents.retrieve(data.paymentIntentId, {
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

  // Guest annual reports are Florida-only. The year is the Eastern calendar
  // year on the server. A client reportYear, late fee, or amount is ignored.
  // The lookup is repeated here so a dissolved or already-filed company is not saved.
  const now = new Date();
  const decision = await resolveGuestAnnualReportCharge({
    documentNumber: data.documentNumber,
    entityType: data.entityType,
    useOurRa: data.useOurRa,
    now,
    locale,
  });
  if (!decision.ok) {
    await alertUnsavedAnnualReport(
      `Payment ${pi.id} charged ${pi.amount} cents. ${decision.error} No refund was issued.`,
    );
    return { ok: false as const, error: decision.error };
  }
  const reportYear = decision.reportYear;
  const quote = decision.quote;
  const email = data.guestEmail.toLowerCase().trim();

  // Verify Stripe amount matches our expected total (±1 cent for rounding).
  // A mismatch after a successful charge is reported. The card is not refunded.
  if (Math.abs(pi.amount - quote.totalCents) > 1) {
    await alertUnsavedAnnualReport(
      `Payment ${pi.id} charged ${pi.amount} cents. Server quote is ${quote.totalCents} cents. No refund was issued.`,
    );
    return { ok: false as const, error: 'Payment amount mismatch. Please contact support.' };
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
    select: { filingId: true },
  });
  if (existingPayment) {
    return { ok: true as const, filingId: existingPayment.filingId };
  }

  try {
    // Find or create a guest user account by email. SECURITY: if the email
    // already belongs to a real (non-guest) account, we must NOT attach a paid,
    // APPROVED filing to it from an unauthenticated request - that would let an
    // attacker plant records in a victim's dashboard. Require sign-in instead.
    const session = await auth();
    let user = await prisma.user.findUnique({ where: { email } });
    if (user && session?.user?.id !== user.id) {
      return {
        ok: false as const,
        error:
          'An account already exists for this email. Please sign in first to file under your account.',
      };
    }
    if (!user) {
      // bcrypt hash of a random secret (consistent with the rest of the app;
      // credentials login simply never matches until the user resets it).
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Guest',
          lastName: '',
          emailVerified: false,
          accountStatus: 'ACTIVE',
          role: 'USER',
        },
      });
    }

    const qaMarked = qaMarkedFromRequest();
    const filingId = await prisma.$transaction(async (tx) => {
      const filing = await tx.filing.create({
        data: {
          userId: user!.id,
          ...filingTestCreateFields({ qaMarked, isTester: user!.isTester }),
          entityType: decision.entityType,
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
          reportYear,
          dueDate: new Date(`${reportYear}-05-01T23:59:00`),
          status: 'FILED',
          filedDate: new Date(),
          filingFeeCents: quote.filingFeeCents,
          lateFeeCents: quote.lateFeeCents,
          totalCostCents: quote.totalCents,
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
          isTest: isTestPayment({
            stripePaymentIntentId: pi.id,
            livemode: pi.livemode,
            metadata: pi.metadata,
            userIsTester: user!.isTester,
          }),
          stateFilingFeeCents: quote.stateFilingFeeCents,
          formationServiceFeeCents: ANNUAL_REPORT_SERVICE_FEE_CENTS,
          registeredAgentY1Cents: quote.raFee,
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

    await stampQaLaunchformaGuest({
      userId: user!.id,
      filingId: filingId.filingId,
      emails: [email],
      qaMarked,
    });

    try {
      await notifyAdminOfPaidOrder(filingId.filingId);
    } catch (err) {
      logger.error('Paid annual report alert failed', { area: 'annual-report' }, err);
    }

    return { ok: true as const, filingId: filingId.filingId };
  } catch (e) {
    logger.error('Guest annual report processing failed', {
      area: 'annual-report',
      tag: 'guest-annual-report',
    }, e);
    return { ok: false as const, error: 'Something went wrong. Please try again.' };
  }
}
