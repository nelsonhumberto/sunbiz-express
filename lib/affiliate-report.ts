import { prisma } from '@/lib/db';
import {
  commissionEventAt,
  inMonth,
  monthRangeUtc,
  parseCommissionMonth,
  type CommissionOrder,
} from '@/lib/affiliate-admin';

export async function loadCommissionOrders(input: {
  month?: string | null;
  partnerId?: string | null;
}): Promise<{ label: string; year: number; month: number; orders: CommissionOrder[] }> {
  const month = parseCommissionMonth(input.month);
  const range = monthRangeUtc(month.year, month.month);
  const partnerId = input.partnerId?.trim() || null;
  const filings = await prisma.filing.findMany({
    where: {
      commissionStatus: { not: null },
      referralPartnerId: partnerId ? partnerId : { not: null },
      OR: [
        { payments: { some: { completedAt: { gte: range.start, lt: range.end } } } },
        {
          payments: {
            some: {
              completedAt: null,
              status: 'SUCCEEDED',
              createdAt: { gte: range.start, lt: range.end },
            },
          },
        },
        { submittedAt: { gte: range.start, lt: range.end } },
        { createdAt: { gte: range.start, lt: range.end } },
      ],
    },
    include: {
      referralPartner: true,
      user: { select: { email: true } },
      payments: {
        select: {
          status: true,
          stripePaymentIntentId: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const orders: CommissionOrder[] = [];
  for (const filing of filings) {
    if (!filing.referralPartner || filing.commissionCents == null || !filing.commissionStatus) continue;
    const eventAt = commissionEventAt({
      checkoutPaymentIntentId: filing.checkoutPaymentIntentId,
      submittedAt: filing.submittedAt,
      createdAt: filing.createdAt,
      payments: filing.payments,
    });
    if (!inMonth(eventAt, month.year, month.month)) continue;
    orders.push({
      filingId: filing.id,
      businessName: filing.businessName,
      serviceTier: filing.serviceTier,
      buyerEmail: filing.user.email,
      commissionCents: filing.commissionCents,
      commissionStatus: filing.commissionStatus,
      payoutRef: filing.commissionPayoutRef,
      eventAt,
      partnerId: filing.referralPartner.id,
      partnerName: filing.referralPartner.name,
      partnerCode: filing.referralPartner.code,
      partnerEmail: filing.referralPartner.email,
      paypalEmail: filing.referralPartner.paypalEmail,
    });
  }
  return { label: month.label, year: month.year, month: month.month, orders };
}
