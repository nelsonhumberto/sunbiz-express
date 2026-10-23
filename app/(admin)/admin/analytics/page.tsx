import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { adminRevenuePaymentWhere } from '@/lib/payment-test';
import { AnalyticsCharts } from './analytics-charts';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  // Exclude admin-archived filings so auditor fakes don't skew KPIs.
  // Revenue is succeeded, non-test payments with a Stripe charge or real pi_.
  const [filings, revenuePayments] = await Promise.all([
    prisma.filing.findMany({
      where: { adminArchivedAt: null },
      select: { status: true, serviceTier: true, createdAt: true, entityType: true, id: true },
    }),
    prisma.payment.findMany({
      where: {
        ...adminRevenuePaymentWhere,
        filing: { adminArchivedAt: null },
      },
      select: { amountCents: true, createdAt: true, filingId: true },
    }),
  ]);

  const statusCounts = filings.reduce(
    (acc, f) => ({ ...acc, [f.status]: (acc[f.status] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  const tierCounts = filings.reduce(
    (acc, f) => ({ ...acc, [f.serviceTier]: (acc[f.serviceTier] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  // Last 30 days of filings, by day
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { day: string; count: number; revenue: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const inDay = filings.filter(
      (f) => f.createdAt >= d && f.createdAt < next
    );
    const paidInDay = revenuePayments.filter(
      (p) => p.createdAt >= d && p.createdAt < next
    );
    days.push({
      day: d.toISOString().slice(5, 10),
      count: inDay.length,
      revenue: paidInDay.reduce((s, p) => s + p.amountCents, 0) / 100,
    });
  }

  const totalRevenue = revenuePayments.reduce((s, p) => s + p.amountCents, 0);
  const paidFilingCount = new Set(revenuePayments.map((p) => p.filingId)).size;
  const avgFilingValue = paidFilingCount > 0 ? totalRevenue / paidFilingCount : 0;
  const llcCount = filings.filter((f) => f.entityType === 'LLC').length;
  const corpCount = filings.filter((f) => f.entityType === 'CORP').length;

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Analytics</h1>
        <p className="mt-1 text-ink-muted">Conversion, revenue, and product mix.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Lifetime revenue" value={formatCurrency(totalRevenue, { showZero: true })} />
        <KpiCard label="Avg. filing value" value={formatCurrency(avgFilingValue, { showZero: true })} />
        <KpiCard label="LLC formations" value={String(llcCount)} />
        <KpiCard label="Corp formations" value={String(corpCount)} />
      </div>

      <AnalyticsCharts
        days={days}
        statusCounts={statusCounts}
        tierCounts={tierCounts}
      />
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">{label}</p>
        <p className="font-display text-3xl font-medium mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}
