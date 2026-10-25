import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { isTestPayment } from '@/lib/payment-test';
import {
  parseReinstatementSnapshot,
  type ReinstatementOrderSnapshot,
} from '@/lib/reinstatement-quote';
import { getStripe } from '@/lib/stripe';
import { formatCurrency } from '@/lib/utils';
import {
  enforceServerAmount,
  priceServiceOrder,
  reinstatementStripeMetadata,
  serviceOrderError,
  type PricedServiceOrder,
} from '@/lib/service-order';

const CompleteSchema = z.object({
  paymentIntentId: z.string().min(1).max(255),
});

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? 'Guest',
    lastName: parts.slice(1).join(' '),
  };
}

function lineSummary(order: Extract<PricedServiceOrder, { type: 'reinstatement' }>): string {
  const money = (cents: number) => formatCurrency(cents, { showZero: true });
  const es = order.locale === 'es';
  const rows = order.quote.lines.map((line) => {
    if (line.kind === 'service') {
      return es ? `Tarifa de servicio: ${money(line.cents)}` : `Service fee: ${money(line.cents)}`;
    }
    if (line.kind === 'reinstatement') {
      return es
        ? `Tarifa de reactivación de Florida (tarifa estatal, al costo): ${money(line.cents)}`
        : `Florida reinstatement fee (state fee, passed through at cost): ${money(line.cents)}`;
    }
    if (line.kind === 'annual_report') {
      return es
        ? `Reporte anual ${line.year} (tarifa estatal, al costo): ${money(line.cents)}`
        : `Annual report ${line.year} (state fee, passed through at cost): ${money(line.cents)}`;
    }
    return es
      ? `Recargo por presentación tardía ${line.year} (tarifa estatal, al costo): ${money(line.cents)}`
      : `Late fee ${line.year} (state fee, passed through at cost): ${money(line.cents)}`;
  });
  const total = es ? `Total: ${money(order.amountCents)}` : `Total: ${money(order.amountCents)}`;
  return [...rows, total].join('\n');
}

function snapshotFor(
  order: Extract<PricedServiceOrder, { type: 'reinstatement' }>,
): ReinstatementOrderSnapshot {
  const input = order.input;
  return {
    kind: 'reinstatement',
    documentNumber: order.documentNumber,
    companyName: input.companyName.trim(),
    sunbizStatus: blankToNull(input.sunbizStatus),
    years: order.quote.years,
    lateYears: order.quote.lateYears,
    contactName: input.contactName.trim(),
    email: order.email,
    phone: input.phone.trim(),
    officerName: input.officerName.trim(),
    officerTitle: input.officerTitle.trim(),
    changeNote: blankToNull(input.changeNote),
    locale: order.locale,
    serviceCents: order.quote.serviceCents,
    reinstatementFeeCents: order.quote.reinstatementFeeCents,
    annualReportCents: order.quote.annualReportCents,
    lateFeeCents: order.quote.lateFeeCents,
    stateFeeCents: order.quote.stateFeeCents,
    totalCents: order.amountCents,
  };
}

export async function fulfillReinstatementOrder(
  body: unknown,
): Promise<{ ok: true; filingId: string } | { ok: false; error: string }> {
  const priced = priceServiceOrder(body);
  const intent = CompleteSchema.safeParse(body);
  if (!priced.ok || priced.order.type !== 'reinstatement' || !intent.success) {
    const locale = priced.ok ? priced.order.locale : priced.locale;
    return { ok: false, error: serviceOrderError(locale, 'invalid') };
  }
  const order = priced.order;
  const locale = order.locale;

  if (!enforceServerAmount(order.input.amountCents, order.amountCents).ok) {
    return { ok: false, error: serviceOrderError(locale, 'amount') };
  }

  let pi;
  try {
    pi = await getStripe().paymentIntents.retrieve(intent.data.paymentIntentId, {
      expand: ['payment_method'],
    });
  } catch (err) {
    logger.warn('reinstatement payment retrieve failed', {
      area: 'stripe',
      tag: 'service-order',
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: serviceOrderError(locale, 'payment') };
  }

  if (pi.status !== 'succeeded') {
    return { ok: false, error: serviceOrderError(locale, 'payment') };
  }

  const metadata = reinstatementStripeMetadata(order.documentNumber, order.quote.years);
  if (pi.metadata?.type !== 'reinstatement' || pi.metadata.documentNumber !== order.documentNumber) {
    return { ok: false, error: serviceOrderError(locale, 'invalid') };
  }
  if (pi.metadata.years !== metadata.years) {
    return { ok: false, error: serviceOrderError(locale, 'amount') };
  }
  if (Math.abs(pi.amount - order.amountCents) > 0) {
    return { ok: false, error: serviceOrderError(locale, 'amount') };
  }

  const existing = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: pi.id },
    select: { filingId: true },
  });
  if (existing) return { ok: true, filingId: existing.filingId };

  const pm = pi.payment_method && typeof pi.payment_method === 'object' ? pi.payment_method : null;
  const cardLast4 = pm?.card?.last4 ?? null;
  const cardBrand = pm?.card?.brand
    ? pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)
    : null;
  const pmCardholderName = pm?.billing_details?.name ?? null;
  const pmId = pm?.id ?? null;
  const testPayment = isTestPayment({ stripePaymentIntentId: pi.id, livemode: pi.livemode });
  const snap = snapshotFor(order);

  const session = await auth();
  let user = await prisma.user.findUnique({ where: { email: order.email } });
  if (user && session?.user?.id !== user.id) {
    return { ok: false, error: serviceOrderError(locale, 'account') };
  }
  if (!user) {
    const name = splitName(snap.contactName);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    user = await prisma.user.create({
      data: {
        email: order.email,
        passwordHash,
        firstName: name.firstName,
        lastName: name.lastName,
        phone: snap.phone,
        emailVerified: false,
        accountStatus: 'ACTIVE',
        role: 'USER',
        locale,
      },
    });
  }

  let filingId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const filing = await tx.filing.create({
        data: {
          userId: user.id,
          entityType: 'LLC',
          state: 'FL',
          businessName: snap.companyName,
          filingSource: 'REINSTATEMENT',
          status: 'SUBMITTED',
          confirmationAccepted: true,
          contactPhone: snap.phone,
          correspondenceContact: JSON.stringify({
            name: snap.contactName,
            email: snap.email,
            phone: snap.phone,
          }),
          optionalDetails: JSON.stringify(snap),
          notes: [
            'Florida LLC reinstatement. File with Sunbiz on the customer behalf.',
            `Document: ${snap.documentNumber}`,
            `Sunbiz status: ${snap.sunbizStatus ?? 'Not provided'}`,
            `Years: ${snap.years.join(', ')}`,
            `Late years: ${snap.lateYears.join(', ') || 'None'}`,
            `Officer: ${snap.officerName}, ${snap.officerTitle}`,
            snap.changeNote ? `Officer/manager changes: ${snap.changeNote}` : 'Officer/manager changes: none noted',
            `Total cents: ${snap.totalCents}`,
          ].join('\n'),
          stateFeeCents: snap.stateFeeCents,
          serviceFeeCents: snap.serviceCents,
          totalCents: snap.totalCents,
          locale,
          entryPath: locale === 'es' ? '/es/reinstate-llc' : '/reinstate-llc',
          isTest: testPayment,
          submittedAt: new Date(),
        },
      });
      await tx.payment.create({
        data: {
          filingId: filing.id,
          userId: user.id,
          stripePaymentIntentId: pi.id,
          stripePaymentMethodId: pmId,
          amountCents: pi.amount,
          status: 'SUCCEEDED',
          isTest: testPayment,
          stateFilingFeeCents: snap.stateFeeCents,
          formationServiceFeeCents: snap.serviceCents,
          registeredAgentY1Cents: 0,
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
      return filing;
    });
    filingId = created.id;
  } catch (err) {
    logger.error('reinstatement order save failed', { area: 'stripe', tag: 'service-order' }, err);
    const again = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: pi.id },
      select: { filingId: true },
    });
    if (again) return { ok: true, filingId: again.filingId };
    return { ok: false, error: serviceOrderError(locale, 'payment') };
  }

  const summary = lineSummary(order);
  try {
    await sendEmail({
      type: 'REINSTATEMENT_ORDER_ADMIN',
      to: INQUIRY_NOTIFY_EMAIL,
      filingId,
      userId: user.id,
      context: {
        businessName: snap.companyName,
        locale,
        reinstatementDocument: snap.documentNumber,
        reinstatementStatus: snap.sunbizStatus ?? undefined,
        reinstatementContactName: snap.contactName,
        reinstatementEmail: snap.email,
        reinstatementPhone: snap.phone,
        reinstatementOfficer: snap.officerName,
        reinstatementOfficerTitle: snap.officerTitle,
        reinstatementChangeNote: snap.changeNote ?? undefined,
        reinstatementSummary: summary,
        reinstatementIsTest: testPayment,
        totalCents: snap.totalCents,
        filingNumber: filingId,
      },
    });
  } catch (err) {
    logger.error('reinstatement admin email failed', { area: 'email', tag: 'reinstatement' }, err);
  }

  try {
    await sendEmail({
      type: 'REINSTATEMENT_ORDER_RECEIPT',
      to: snap.email,
      filingId,
      userId: user.id,
      context: {
        businessName: snap.companyName,
        locale,
        reinstatementDocument: snap.documentNumber,
        reinstatementContactName: snap.contactName,
        reinstatementSummary: summary,
        totalCents: snap.totalCents,
      },
    });
  } catch (err) {
    logger.error('reinstatement receipt email failed', { area: 'email', tag: 'reinstatement' }, err);
  }

  return { ok: true, filingId };
}

export function confirmationSnapshot(optionalDetails: string | null | undefined) {
  return parseReinstatementSnapshot(optionalDetails);
}
