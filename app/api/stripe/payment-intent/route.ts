import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { cookies, headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getGuestUser } from '@/lib/guest';
import { CHECKOUT_ACCOUNT_REQUIRED } from '@/lib/guest-identity';
import { isDeliverableEmail, normalizeEmail } from '@/lib/email-address';
import {
  authorizeGuestFormationPayment,
  filingCheckoutEmailDetails,
} from '@/lib/guest-checkout';
import { safeParseJson } from '@/lib/utils';
import {
  ADD_ON_BY_SLUG,
  tierBundledStateFeeCents,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import { quoteAnnualReport } from '@/lib/annual-report-quote';
import { resolveGuestAnnualReportCharge } from '@/lib/guest-annual-report-charge';
import { filingTotalsChanged, quoteDraftFiling } from '@/lib/filing-totals';
import {
  DOCUMENT_NUMBER_REQUIRED,
  guestAnnualReportPaymentIntentMatches,
  guestDocumentNumberRequiredMessage,
  isMissingDocumentNumberIssue,
} from '@/lib/guest-annual-report-offer';
import {
  CERTIFICATE_ORDER_PURPOSE,
  certificateOffer,
  certificateOrderQuote,
  filingEntityType,
  isCertificateAddOnSlug,
} from '@/lib/certificate-addons';
import {
  CHECKOUT_BELOW_STATE_FEE_ERROR,
  checkoutBelowStateFee,
} from '@/lib/checkout-guard';
import {
  getFormationState,
  isActiveFormationState,
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
import { LOCALE_HEADER, PUBLIC_PATH_HEADER } from '@/lib/locale-paths';
import {
  paymentIntentErrorMessage,
  type PaymentIntentErrorCode,
} from '@/lib/payment-intent-errors';
import { resolveRequestLocale } from '@/lib/request-locale';
import { AnnualReportDraftSchema } from '@/lib/annual-report-draft';
import { z } from 'zod';

// Never statically analyse this route - it needs the Stripe key at runtime.
export const dynamic = 'force-dynamic';

function checkoutRequestLocale(): 'en' | 'es' {
  try {
    const headerStore = headers();
    // The API path has no locale. The wizard address bar is the Referer.
    // Cookie and Accept-Language are not read.
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

function paymentError(code: PaymentIntentErrorCode, status: number) {
  const locale = checkoutRequestLocale();
  const error =
    code === 'account_required' && locale !== 'es'
      ? CHECKOUT_ACCOUNT_REQUIRED
      : code === 'below_state_fee' && locale !== 'es'
        ? CHECKOUT_BELOW_STATE_FEE_ERROR
        : paymentIntentErrorMessage(code, locale);
  return NextResponse.json({ error, code }, { status });
}

function refuseInactiveFormationState(state: string | null | undefined): NextResponse | null {
  if (isActiveFormationState(state)) return null;
  return paymentError('state_unavailable', 400);
}

const GuestAnnualReportChargeSchema = z.object({
  entityType: z.enum(['LLC', 'CORP'], {
    errorMap: () => ({ message: 'Choose LLC or corporation.' }),
  }),
  useOurRa: z.boolean({
    errorMap: () => ({ message: 'Choose whether to add registered agent service.' }),
  }),
  documentNumber: z
    .string({
      required_error: DOCUMENT_NUMBER_REQUIRED,
      invalid_type_error: DOCUMENT_NUMBER_REQUIRED,
    })
    .trim()
    .min(5)
    .max(24),
  paymentIntentId: z.string().trim().min(1).optional(),
  guestAttemptId: z.string().trim().min(8).max(80).optional(),
});

/**
 * Guest annual report checkout is flagged on the URL so a logged-out formation
 * request still returns 401 before the body is read.
 */
function isGuestAnnualReportCheckout(request: NextRequest): boolean {
  return request.nextUrl?.searchParams?.get('purpose') === 'guest_annual_report';
}

interface PaymentBody {
  filingId?: string;
  posthogDistinctId?: string;
  certificateSlug?: string;
  purpose?: string;
  couponCode?: string;
  raServiceId?: string;
  useOurRa?: boolean;
  /** Real mailbox a guest types on the payment step. Ignored for signed-in users. */
  email?: string;
  annualReportId?: string;
  annualReport?: unknown;
}

/**
 * POST /api/stripe/payment-intent
 *
 * No session and no guest cookie is 401 before the body is read. A guest
 * cookie can pay only for a draft that cookie owns, and only after a real
 * email is stored on that guest. An email that already belongs to a
 * non-guest account is refused. The signed-in user must own the filing.
 * The amount is computed here and the client amount is ignored.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit(`payment-intent:${clientIp()}`, 10, 60 * 1000);
  if (!limit.ok) {
    return paymentError('rate_limited', 429);
  }

  const session = await auth();
  const userId = session?.user?.id;

  if (isGuestAnnualReportCheckout(request)) {
    return createGuestAnnualReportPaymentIntent(request, userId);
  }

  if (!userId) {
    const guest = await getGuestUser();
    if (!guest) {
      return paymentError('start_filing_first', 401);
    }
    try {
      return await createGuestFormationPaymentIntent(request, guest);
    } catch (err) {
      logger.error('Stripe PaymentIntent error', { area: 'stripe', tag: 'payment-intent' }, err);
      return paymentError('create_failed', 500);
    }
  }

  try {
    const body = (await request.json()) as PaymentBody;
    const { filingId, posthogDistinctId, certificateSlug, purpose, couponCode, raServiceId } = body;

    if (isCertificateAddOnSlug(certificateSlug)) {
      return createCertificatePaymentIntent({
        stripe: getStripe(),
        actorId: userId,
        filingId,
        slug: certificateSlug,
        posthogDistinctId,
      });
    }

    const priced = await priceOwnedCharge({
      userId,
      filingId,
      purpose,
      couponCode,
      raServiceId,
      useOurRa: body.useOurRa === true,
      annualReportId: body.annualReportId,
      annualReport: body.annualReport,
    });
    if (priced instanceof NextResponse) return priced;

    const stripe = getStripe();
    const customerId = await ensureStripeCustomer(stripe, userId);
    const attribution = readPaymentAttribution(posthogDistinctId);
    const intentParams = {
      amount: priced.amountCents,
      currency: 'usd' as const,
      ...(customerId
        ? { customer: customerId, setup_future_usage: 'off_session' as const }
        : {}),
      automatic_payment_methods: { enabled: true },
      metadata: {
        ...(priced.filingId ? { filingId: priced.filingId } : {}),
        ...(priced.purpose ? { purpose: priced.purpose } : {}),
        userId,
        ...checkoutAttributionMetadata({
          cookie: attribution.cookieUtm,
          filing: priced.attributionFiling,
          posthogDistinctId: attribution.distinctId,
        }),
      },
    };

    const paymentIntent = await resolveCheckoutPaymentIntent({
      stripe,
      filingId: priced.reuseFilingCheckout ? priced.filingId : undefined,
      storedPaymentIntentId: priced.storedPaymentIntentId,
      amountCents: priced.amountCents,
      intentParams,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    logger.error('Stripe PaymentIntent error', { area: 'stripe', tag: 'payment-intent' }, err);
    return paymentError('create_failed', 500);
  }
}

/**
 * Formation checkout for the guest who owns the draft.
 * Certificates, EIN, annual reports, and renewals stay account-only.
 * The real email is written on the user and the filing before Stripe runs.
 */
async function createGuestFormationPaymentIntent(
  request: NextRequest,
  guest: { id: string; email: string; firstName: string; lastName: string },
) {
  let body: PaymentBody;
  try {
    body = (await request.json()) as PaymentBody;
  } catch {
    return paymentError('filing_not_found', 400);
  }

  if (
    isCertificateAddOnSlug(body.certificateSlug) ||
    body.purpose === 'ein' ||
    body.purpose === 'annual_report' ||
    body.purpose === 'ra_renewal' ||
    Boolean(body.raServiceId)
  ) {
    return paymentError('account_required', 403);
  }

  if (!body.filingId) {
    return paymentError('filing_not_found', 404);
  }

  const filing = await prisma.filing.findUnique({
    where: { id: body.filingId },
    select: {
      id: true,
      userId: true,
      status: true,
      state: true,
      optionalDetails: true,
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
    },
  });

  const normalized = normalizeEmail(body.email ?? '');
  const emailOwner =
    isDeliverableEmail(normalized) && !normalized.endsWith('.invalid')
      ? await prisma.user.findUnique({
          where: { email: normalized },
          select: { id: true, accountStatus: true },
        })
      : null;

  const decision = authorizeGuestFormationPayment({
    guestUserId: guest.id,
    filingUserId: filing?.userId ?? null,
    filingStatus: filing?.status ?? null,
    alreadyPaid: (filing?.payments.length ?? 0) > 0,
    email: body.email ?? '',
    emailOwner,
  });

  if (!decision.ok) {
    if (decision.reason === 'existing_account') {
      if (filing && filing.userId === guest.id) {
        await rememberCheckoutEmail(filing.id, filing.optionalDetails, normalized, true);
      }
      return paymentError('existing_account', 403);
    }
    if (decision.reason === 'email_held') {
      return paymentError('email_unavailable', 409);
    }
    if (decision.reason === 'not_owner' || !filing) {
      return paymentError('filing_not_found', 404);
    }
    if (decision.reason === 'already_paid' || decision.reason === 'not_draft') {
      return paymentError('already_paid', 409);
    }
    return paymentError('invalid_email', 400);
  }

  if (!isActiveFormationState(filing.state)) {
    return paymentError('state_unavailable', 400);
  }

  if (normalizeEmail(guest.email) !== decision.email) {
    try {
      await prisma.user.update({
        where: { id: guest.id },
        data: { email: decision.email },
      });
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
      const winner = await prisma.user.findUnique({
        where: { email: decision.email },
        select: { id: true, accountStatus: true },
      });
      if (winner && winner.id !== guest.id && winner.accountStatus !== 'GUEST') {
        return paymentError('existing_account', 403);
      }
      return paymentError('email_unavailable', 409);
    }
  }

  await rememberCheckoutEmail(filing!.id, filing!.optionalDetails, decision.email, false);

  const priced = await priceOwnedCharge({
    userId: guest.id,
    filingId: body.filingId,
    purpose: body.purpose,
    couponCode: body.couponCode,
    raServiceId: body.raServiceId,
    useOurRa: body.useOurRa === true,
  });
  if (priced instanceof NextResponse) return priced;

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(stripe, guest.id);
  if (customerId) {
    try {
      await stripe.customers.update(customerId, {
        email: decision.email,
        metadata: { userId: guest.id },
      });
    } catch (err) {
      logger.warn('guest stripe customer email update failed', {
        area: 'stripe',
        tag: 'guest-customer-email',
        entityId: guest.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const attribution = readPaymentAttribution(body.posthogDistinctId);
  const paymentIntent = await resolveCheckoutPaymentIntent({
    stripe,
    filingId: priced.reuseFilingCheckout ? priced.filingId : undefined,
    storedPaymentIntentId: priced.storedPaymentIntentId,
    amountCents: priced.amountCents,
    intentParams: {
      amount: priced.amountCents,
      currency: 'usd',
      receipt_email: decision.email,
      ...(customerId
        ? { customer: customerId, setup_future_usage: 'off_session' as const }
        : {}),
      automatic_payment_methods: { enabled: true },
      metadata: {
        ...(priced.filingId ? { filingId: priced.filingId } : {}),
        ...(priced.purpose ? { purpose: priced.purpose } : {}),
        userId: guest.id,
        ...checkoutAttributionMetadata({
          cookie: attribution.cookieUtm,
          filing: priced.attributionFiling,
          posthogDistinctId: attribution.distinctId,
        }),
      },
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  });
}

/**
 * Public Florida annual report PaymentIntent. The amount is quoted again here
 * from the company lookup and the Eastern year. Client amount, late fee, and
 * year are ignored. A dissolved or already-filed company is not charged.
 * An open or succeeded guest PaymentIntent is reused. The card is not refunded here.
 */
async function createGuestAnnualReportPaymentIntent(
  request: NextRequest,
  userId: string | undefined,
) {
  const guestLimit = rateLimit(`guest-annual-report:${clientIp()}`, 10, 60 * 1000);
  if (!guestLimit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Check the form and try again.' }, { status: 400 });
  }

  const parsed = GuestAnnualReportChargeSchema.safeParse(body);
  if (!parsed.success) {
    const locale = checkoutRequestLocale();
    if (isMissingDocumentNumberIssue(parsed.error.issues[0])) {
      return NextResponse.json(
        {
          error: guestDocumentNumberRequiredMessage(locale),
          code: 'document_number_required',
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const decision = await resolveGuestAnnualReportCharge({
    documentNumber: parsed.data.documentNumber,
    entityType: parsed.data.entityType,
    useOurRa: parsed.data.useOurRa,
    now,
    locale: checkoutRequestLocale(),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error, code: decision.code }, { status: 400 });
  }
  const quote = decision.quote;
  const reportYear = decision.reportYear;
  const stripe = getStripe();
  const metadata: Stripe.MetadataParam = {
    purpose: 'guest_annual_report',
    entityType: decision.entityType,
    useOurRa: parsed.data.useOurRa ? 'true' : 'false',
    reportYear: String(reportYear),
    documentNumber: parsed.data.documentNumber,
    ...(userId ? { userId } : {}),
  };

  if (parsed.data.paymentIntentId) {
    try {
      const existing = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
      if (guestAnnualReportPaymentIntentMatches(existing.metadata, parsed.data.documentNumber)) {
        if (existing.status === 'succeeded') {
          return NextResponse.json({
            clientSecret: existing.client_secret,
            paymentIntentId: existing.id,
            alreadySucceeded: true,
          });
        }
        if (isReusablePaymentIntentStatus(existing.status)) {
          const paymentIntent =
            existing.amount === quote.totalCents
              ? existing
              : await stripe.paymentIntents.update(existing.id, {
                  amount: quote.totalCents,
                  metadata,
                });
          return NextResponse.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
          });
        }
      }
    } catch {
      return NextResponse.json({ error: 'Could not reuse that payment.' }, { status: 400 });
    }
  }

  const attemptId = parsed.data.guestAttemptId?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  const idempotencyKey = attemptId
    ? `guest_ar_${attemptId}_amt_${quote.totalCents}`.slice(0, 255)
    : undefined;
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: quote.totalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  });
}

async function rememberCheckoutEmail(
  filingId: string,
  existing: string | null,
  email: string,
  pendingAccount: boolean,
) {
  const prev = safeParseJson<Record<string, unknown>>(existing, {}) ?? {};
  const next = pendingAccount
    ? { ...prev, pendingAccountEmail: email, typedGuestEmail: email }
    : filingCheckoutEmailDetails(prev, email);
  await prisma.filing.update({
    where: { id: filingId },
    data: { optionalDetails: JSON.stringify(next) },
  });
}

function isUniqueConflict(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002');
}

interface PricedCharge {
  amountCents: number;
  filingId?: string;
  purpose?: string;
  storedPaymentIntentId: string | null;
  reuseFilingCheckout: boolean;
  attributionFiling: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
  } | null;
}

async function priceOwnedCharge(input: {
  userId: string;
  filingId?: string;
  purpose?: string;
  couponCode?: string;
  raServiceId?: string;
  useOurRa: boolean;
  annualReportId?: string;
  annualReport?: unknown;
}): Promise<PricedCharge | NextResponse> {
  if (input.purpose === 'ra_renewal') {
    if (!input.raServiceId) {
      return paymentError('filing_not_found', 404);
    }
    const service = await prisma.registeredAgentService.findUnique({
      where: { id: input.raServiceId },
      include: {
        filing: {
          select: {
            id: true,
            userId: true,
            state: true,
            utmSource: true,
            utmMedium: true,
            utmCampaign: true,
            utmContent: true,
            utmTerm: true,
          },
        },
      },
    });
    if (!service || service.filing.userId !== input.userId) {
      return paymentError('filing_not_found', 404);
    }
    const inactiveRa = refuseInactiveFormationState(service.filing.state);
    if (inactiveRa) return inactiveRa;
    return {
      amountCents: service.renewalPriceCents,
      purpose: 'ra_renewal',
      storedPaymentIntentId: null,
      reuseFilingCheckout: false,
      attributionFiling: service.filing,
    };
  }

  if (!input.filingId) {
    return paymentError('filing_not_found', 404);
  }

  const filing = await prisma.filing.findUnique({
    where: { id: input.filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
    },
  });
  if (!filing || filing.userId !== input.userId) {
    return paymentError('filing_not_found', 404);
  }
  const inactiveFiling = refuseInactiveFormationState(filing.state);
  if (inactiveFiling) return inactiveFiling;

    if (input.purpose === 'ein') {
    return {
      amountCents: ADD_ON_BY_SLUG.ein.serviceMarginCents,
      purpose: 'ein',
      storedPaymentIntentId: null,
      reuseFilingCheckout: false,
      attributionFiling: filing,
    };
  }

  if (input.purpose === 'annual_report') {
    // Reject an incomplete form before Stripe creates a PaymentIntent.
    const draft = AnnualReportDraftSchema.safeParse(input.annualReport);
    if (!draft.success) {
      return NextResponse.json(
        { error: draft.error.issues[0]?.message ?? 'Check the form and try again.' },
        { status: 400 },
      );
    }
    if (!input.annualReportId) {
      return NextResponse.json({ error: 'Annual report not found.' }, { status: 404 });
    }
    const report = await prisma.annualReport.findUnique({
      where: { id: input.annualReportId },
      select: { id: true, filingId: true, status: true, reportYear: true },
    });
    if (!report || report.filingId !== filing.id) {
      return NextResponse.json({ error: 'Annual report not found.' }, { status: 404 });
    }
    if (report.status === 'FILED') {
      return NextResponse.json(
        { error: 'This annual report has already been filed.' },
        { status: 409 },
      );
    }
    const entityType = filing.entityType === 'CORP' ? 'CORP' : 'LLC';
    const rule = getFormationState(filing.state);
    // The report year comes from the database. A client year cannot skip the fee.
    const quote = quoteAnnualReport(
      rule.code,
      entityType,
      draft.data.useOurRa,
      report.reportYear,
      new Date(),
    );
    return {
      amountCents: quote.totalCents,
      filingId: filing.id,
      purpose: 'annual_report',
      storedPaymentIntentId: null,
      reuseFilingCheckout: false,
      attributionFiling: filing,
    };
  }

  if (filing.status !== 'DRAFT' || filing.payments.length > 0) {
    return paymentError('already_paid', 409);
  }

  // Catalog price plus selected add-ons. Stored totals and the client body are ignored.
  const totals = quoteDraftFiling(filing);
  if (filingTotalsChanged(filing, totals)) {
    try {
      await prisma.filing.update({
        where: { id: filing.id },
        data: totals,
      });
    } catch (err) {
      logger.warn('draft total refresh failed', {
        area: 'stripe',
        tag: 'draft-total-refresh',
        entityId: filing.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const discount = await formationCouponDiscount(input.couponCode, totals.totalCents);
  if (!discount.ok) {
    return paymentError('invalid_coupon', 400);
  }
  const amountCents = Math.max(0, totals.totalCents - discount.discountCents);
  const stateFeeMinimum = tierBundledStateFeeCents(
    filing.serviceTier as TierSlug,
    filing.entityType as EntityType,
    filing.state as StateCode,
  );
  if (checkoutBelowStateFee({ totalCents: amountCents, stateFeeCents: stateFeeMinimum })) {
    return paymentError('below_state_fee', 400);
  }
  return {
    amountCents,
    filingId: filing.id,
    storedPaymentIntentId: filing.checkoutPaymentIntentId,
    reuseFilingCheckout: true,
    attributionFiling: filing,
  };
}

async function formationCouponDiscount(
  code: string | undefined,
  subtotalCents: number,
): Promise<{ ok: true; discountCents: number } | { ok: false }> {
  if (!code?.trim()) return { ok: true, discountCents: 0 };
  const coupon = await prisma.coupon.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!coupon || !coupon.active) return { ok: false };
  if (coupon.expiresAt && coupon.expiresAt < new Date()) return { ok: false };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { ok: false };
  const raw = coupon.type === 'PERCENT' ? Math.round((subtotalCents * coupon.value) / 100) : coupon.value;
  return { ok: true, discountCents: Math.min(Math.max(raw, 0), subtotalCents) };
}

function readPaymentAttribution(posthogDistinctId?: string) {
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
  return {
    cookieUtm,
    distinctId: sanitizeDistinctId(posthogDistinctId) ?? cookieDistinctId,
  };
}

async function ensureStripeCustomer(stripe: Stripe, userId: string): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true },
  });
  if (!user) return undefined;
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
    metadata: { userId: user.id },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
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
  filingId?: string;
  slug: 'cert_status' | 'cert_copy';
  posthogDistinctId?: string;
}) {
  const { stripe, actorId, filingId, slug } = input;
  if (!filingId) {
    return paymentError('company_not_found', 404);
  }

  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    include: {
      filingAdditionalServices: { include: { service: true } },
      documents: { select: { documentType: true, pendingState: true } },
    },
  });
  if (!filing || filing.userId !== actorId) {
    return paymentError('company_not_found', 404);
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
    return paymentError(offer.kind === 'included' ? 'document_included' : 'document_not_ready', 400);
  }

  const inactiveCertificate = refuseInactiveFormationState(filing.state);
  if (inactiveCertificate) return inactiveCertificate;

  const entityType = filingEntityType(filing.entityType);
  const state = filing.state as StateCode;
  const quote = certificateOrderQuote(slug, entityType, state);
  const attribution = readPaymentAttribution(input.posthogDistinctId);
  const customerId = await ensureStripeCustomer(stripe, actorId);

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
          cookie: attribution.cookieUtm,
          filing,
          posthogDistinctId: attribution.distinctId,
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
