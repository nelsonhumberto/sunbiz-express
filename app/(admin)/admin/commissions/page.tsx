import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatCents, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { summarizePartnerMonth } from '@/lib/affiliate-admin';
import { loadCommissionOrders } from '@/lib/affiliate-report';
import { CommissionActions } from './commission-actions';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT = {
  PENDING: 'warn',
  APPROVED: 'accent',
  PAID: 'success',
  REVERSED: 'secondary',
} as const;

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: { month?: string; partner?: string };
}) {
  const partnerId = searchParams.partner?.trim() || '';
  const [report, partners] = await Promise.all([
    loadCommissionOrders({ month: searchParams.month, partnerId }),
    prisma.partner.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
  ]);
  const summaries = summarizePartnerMonth(report.orders);
  const exportHref = `/api/admin/affiliate-payouts?month=${encodeURIComponent(report.label)}${
    partnerId ? `&partner=${encodeURIComponent(partnerId)}` : ''
  }`;

  return (
    <div className="container max-w-6xl py-10 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Commissions</h1>
          <p className="mt-1 text-ink-muted">
            Monthly totals by partner. Approve, mark paid with a PayPal batch reference, or reverse.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={exportHref}>Download payout CSV</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-ink-muted">Month</span>
              <input
                type="month"
                name="month"
                defaultValue={report.label}
                className="block h-9 rounded-md border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-ink-muted">Partner</span>
              <select
                name="partner"
                defaultValue={partnerId}
                className="block h-9 rounded-md border border-border bg-white px-3 text-sm min-w-[12rem]"
              >
                <option value="">All partners</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name} ({partner.code})
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline">
              Show
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Partner', 'PayPal', 'Pending', 'Approved', 'Paid', 'Reversed'].map((heading) => (
                  <th
                    key={heading}
                    className="text-left px-5 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summaries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-ink-muted">
                    No commissions in {report.label}.
                  </td>
                </tr>
              ) : (
                summaries.map((row) => (
                  <tr key={row.partnerId}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{row.partnerName}</div>
                      <div className="text-xs text-ink-muted font-mono">{row.partnerCode}</div>
                    </td>
                    <td className="px-5 py-3 text-xs">{row.paypalEmail ?? row.partnerEmail}</td>
                    <td className="px-5 py-3 tabular-nums">{formatCents(row.pendingCents)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatCents(row.approvedCents)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatCents(row.paidCents)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatCents(row.reversedCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Order', 'Buyer', 'Product', 'Commission', 'Status', 'When', 'Actions'].map((heading) => (
                  <th
                    key={heading}
                    className="text-left px-5 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-ink-muted">
                    No orders in this month.
                  </td>
                </tr>
              ) : (
                report.orders.map((order) => (
                  <tr key={order.filingId} className="align-top">
                    <td className="px-5 py-3">
                      <div className="font-medium">{order.businessName || 'Untitled filing'}</div>
                      <div className="text-xs text-ink-muted font-mono">{order.partnerCode}</div>
                    </td>
                    <td className="px-5 py-3 text-xs">{order.buyerEmail}</td>
                    <td className="px-5 py-3">{order.serviceTier}</td>
                    <td className="px-5 py-3 tabular-nums">{formatCents(order.commissionCents)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={STATUS_VARIANT[order.commissionStatus]} size="sm">
                        {order.commissionStatus}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap">{formatDate(order.eventAt)}</td>
                    <td className="px-5 py-3">
                      <CommissionActions
                        filingId={order.filingId}
                        status={order.commissionStatus}
                        payoutRef={order.payoutRef}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
