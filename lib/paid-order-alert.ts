import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { TIER_BY_SLUG, type TierSlug } from '@/lib/pricing';

export const ADMIN_ORDER_EMAIL = 'admin@launchforma.com';
export const ADMIN_PAID_ORDER_TYPE = 'ADMIN_PAID_ORDER';
export const ADMIN_FILING_OVERDUE_TYPE = 'ADMIN_FILING_OVERDUE';

export const OVERDUE_SOON_MS = 20 * 60 * 60 * 1000;
export const OVERDUE_MS = 24 * 60 * 60 * 1000;

const EASTERN = 'America/New_York';

export type OverdueBadge = 'overdue_soon' | 'overdue';

export function paidOrderDeadline(paidAt: Date): Date {
  return new Date(paidAt.getTime() + OVERDUE_MS);
}

/** Clock time in America/New_York, with a normal space before AM/PM. */
export function formatEasternDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
  return formatted.replace(/[\u202f\u00a0]/g, ' ').replace(/\u2013|\u2014/g, '-');
}

export function earliestSucceededPaidAt(
  payments: { status: string; completedAt: Date | null; createdAt: Date }[],
): Date | null {
  const times = payments
    .filter((payment) => payment.status === 'SUCCEEDED')
    .map((payment) => payment.completedAt ?? payment.createdAt);
  if (times.length === 0) return null;
  return times.reduce((earliest, time) => (time.getTime() < earliest.getTime() ? time : earliest));
}

/**
 * Badge for a paid filing that still has no state filing number.
 * 20 hours after payment is Overdue soon. 24 hours is Overdue.
 */
export function filingOverdueBadge(input: {
  sunbizFilingNumber: string | null | undefined;
  paidAt: Date | null;
  now: Date;
}): OverdueBadge | null {
  if (input.sunbizFilingNumber?.trim()) return null;
  if (!input.paidAt) return null;
  const elapsed = input.now.getTime() - input.paidAt.getTime();
  if (elapsed >= OVERDUE_MS) return 'overdue';
  if (elapsed >= OVERDUE_SOON_MS) return 'overdue_soon';
  return null;
}

export function planDisplayName(serviceTier: string): string {
  if (serviceTier === 'BASIC' || serviceTier === 'STANDARD' || serviceTier === 'PREMIUM') {
    return TIER_BY_SLUG[serviceTier as TierSlug].name;
  }
  return serviceTier;
}

export function adminFilingUrl(filingId: string): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com').replace(/\/$/, '');
  return `${site}/admin/filings/${filingId}`;
}

type PaidFiling = {
  id: string;
  userId: string;
  businessName: string | null;
  state: string;
  entityType: string;
  serviceTier: string;
  isTest: boolean;
  sunbizFilingNumber: string | null;
  user: { firstName: string; lastName: string; email: string; isTester: boolean };
  payments: {
    status: string;
    amountCents: number;
    isTest: boolean;
    completedAt: Date | null;
    createdAt: Date;
  }[];
  annualReports?: { status: string; totalCostCents: number }[];
};

/** A paid annual report in any status. A zero-cost compliance row is not one. */
export function paidAnnualReportDocumentNumber(filing: {
  sunbizFilingNumber?: string | null;
  annualReports?: { status: string; totalCostCents: number }[];
}): string | null {
  const paid = (filing.annualReports ?? []).some((report) => report.totalCostCents > 0);
  if (!paid) return null;
  return filing.sunbizFilingNumber?.trim() ?? '';
}

function customerName(user: PaidFiling['user']): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function orderIsTest(filing: PaidFiling, paymentIsTest: boolean): boolean {
  return paymentIsTest || filing.isTest || filing.user.isTester;
}

async function alreadySent(filingId: string, notificationType: string): Promise<boolean> {
  const existing = await prisma.emailNotification.findFirst({
    where: { filingId, notificationType },
    select: { id: true },
  });
  return Boolean(existing);
}

async function loadPaidFiling(filingId: string): Promise<PaidFiling | null> {
  return prisma.filing.findUnique({
    where: { id: filingId },
    select: {
      id: true,
      userId: true,
      businessName: true,
      state: true,
      entityType: true,
      serviceTier: true,
      isTest: true,
      sunbizFilingNumber: true,
      annualReports: { select: { status: true, totalCostCents: true } },
      user: { select: { firstName: true, lastName: true, email: true, isTester: true } },
      payments: {
        where: { status: 'SUCCEEDED' },
        select: {
          status: true,
          amountCents: true,
          isTest: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
  });
}

function earliestPayment(filing: PaidFiling) {
  const paidAt = earliestSucceededPaidAt(filing.payments);
  if (!paidAt) return null;
  const payment = filing.payments.find(
    (row) => (row.completedAt ?? row.createdAt).getTime() === paidAt.getTime(),
  );
  return payment ? { payment, paidAt } : null;
}

/**
 * Email admin once when a formation payment succeeds.
 * A later call for the same filing finds the EmailNotification row and skips.
 * Errors are logged and never thrown.
 */
export async function notifyAdminOfPaidOrder(filingId: string): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    if (await alreadySent(filingId, ADMIN_PAID_ORDER_TYPE)) return 'skipped';
    const filing = await loadPaidFiling(filingId);
    const paid = filing ? earliestPayment(filing) : null;
    if (!filing || !paid) return 'skipped';
    const deadline = paidOrderDeadline(paid.paidAt);
    const annualReportDocumentNumber = paidAnnualReportDocumentNumber(filing);
    await sendEmail({
      type: 'ADMIN_PAID_ORDER',
      to: ADMIN_ORDER_EMAIL,
      filingId: filing.id,
      userId: filing.userId,
      context: {
        businessName: filing.businessName ?? '',
        linkFilingId: filing.id,
        customerName: customerName(filing.user),
        customerEmail: filing.user.email,
        orderState: filing.state,
        orderEntity: filing.entityType,
        orderPlan: planDisplayName(filing.serviceTier),
        totalCents: paid.payment.amountCents,
        paidAtLabel: formatEasternDateTime(paid.paidAt),
        deadlineLabel: formatEasternDateTime(deadline),
        adminFilingUrl: adminFilingUrl(filing.id),
        testOrder: orderIsTest(filing, paid.payment.isTest),
        ...(annualReportDocumentNumber !== null ? { annualReportDocumentNumber } : {}),
      },
    });
    return 'sent';
  } catch (err) {
    logger.error(
      'paid order alert failed',
      { area: 'email', entityId: filingId, tag: 'paid-order-alert' },
      err,
    );
    return 'failed';
  }
}

/**
 * One admin email per filing once payment is 20 hours old and no state
 * filing number is stored. Dedupes with the existing EmailNotification
 * row for this filing and type. Test orders are skipped.
 */
export async function runPaidFilingOverdueAlerts(nowMs: number): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
}> {
  let scanned = 0;
  let sent = 0;
  let skipped = 0;
  try {
    const filings = await prisma.filing.findMany({
      where: {
        OR: [{ sunbizFilingNumber: null }, { sunbizFilingNumber: '' }],
        payments: { some: { status: 'SUCCEEDED' } },
      },
      select: {
        id: true,
        userId: true,
        businessName: true,
        state: true,
        entityType: true,
        serviceTier: true,
        isTest: true,
        sunbizFilingNumber: true,
        user: { select: { firstName: true, lastName: true, email: true, isTester: true } },
        payments: {
          where: { status: 'SUCCEEDED' },
          select: {
            status: true,
            amountCents: true,
            isTest: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
      take: 100,
    });
    scanned = filings.length;
    const now = new Date(nowMs);
    for (const filing of filings) {
      const paid = earliestPayment(filing);
      if (!paid) {
        skipped += 1;
        continue;
      }
      const kind = filingOverdueBadge({
        sunbizFilingNumber: filing.sunbizFilingNumber,
        paidAt: paid.paidAt,
        now,
      });
      if (!kind || orderIsTest(filing, paid.payment.isTest)) {
        skipped += 1;
        continue;
      }
      if (await alreadySent(filing.id, ADMIN_FILING_OVERDUE_TYPE)) {
        skipped += 1;
        continue;
      }
      const deadline = paidOrderDeadline(paid.paidAt);
      await sendEmail({
        type: 'ADMIN_FILING_OVERDUE',
        to: ADMIN_ORDER_EMAIL,
        filingId: filing.id,
        userId: filing.userId,
        context: {
          businessName: filing.businessName ?? '',
          linkFilingId: filing.id,
          customerName: customerName(filing.user),
          customerEmail: filing.user.email,
          orderState: filing.state,
          orderEntity: filing.entityType,
          orderPlan: planDisplayName(filing.serviceTier),
          totalCents: paid.payment.amountCents,
          paidAtLabel: formatEasternDateTime(paid.paidAt),
          deadlineLabel: formatEasternDateTime(deadline),
          adminFilingUrl: adminFilingUrl(filing.id),
          overdueKind: kind,
          testOrder: false,
        },
      });
      sent += 1;
    }
  } catch (err) {
    logger.error(
      'overdue filing alert failed',
      { area: 'email', tag: 'paid-order-overdue' },
      err,
    );
  }
  return { scanned, sent, skipped };
}
