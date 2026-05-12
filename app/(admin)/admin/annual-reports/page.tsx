import { Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateLong, formatRelative } from '@/lib/utils';
import { markAnnualReportFiled, markAnnualReportOverdue } from '@/actions/admin-annual';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warn' | 'default' | 'danger' }> = {
  FILED:      { label: 'Filed',      variant: 'success' },
  PENDING:    { label: 'Pending',    variant: 'default' },
  OVERDUE:    { label: 'Overdue',    variant: 'warn' },
  DELINQUENT: { label: 'Delinquent', variant: 'danger' },
};

export default async function AdminAnnualReportsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const statusFilter = searchParams.status;

  const reports = await prisma.annualReport.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    include: {
      filing: {
        include: { user: true },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  const counts = await prisma.annualReport.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count.id]));

  const today = new Date();
  const overdueSoon = reports.filter(
    (r) => r.status === 'PENDING' && r.dueDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  ).length;

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">Annual Reports</h1>
        <p className="mt-1 text-ink-muted">Track compliance deadlines across all active companies.</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Pending" value={byStatus['PENDING'] ?? 0} color="text-ink" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Due in 30 days" value={overdueSoon} color="text-amber-600" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={byStatus['OVERDUE'] ?? 0} color="text-destructive" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Filed" value={byStatus['FILED'] ?? 0} color="text-success" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[undefined, 'PENDING', 'OVERDUE', 'FILED'].map((s) => (
          <a
            key={s ?? 'all'}
            href={s ? `?status=${s}` : '/admin/annual-reports'}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              statusFilter === s || (!statusFilter && !s)
                ? 'bg-primary text-white border-primary'
                : 'border-border text-ink-muted hover:bg-muted'
            }`}
          >
            {s ?? 'All'}
          </a>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {['Business', 'Owner', 'State', 'Year', 'Due date', 'Status', 'Fee', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-ink-muted">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-ink-subtle" />
                    No annual reports found.
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const isOverdueSoon =
                    r.status === 'PENDING' &&
                    r.dueDate <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
                    r.dueDate > today;
                  const isActuallyOverdue = r.status === 'PENDING' && r.dueDate < today;
                  const badge = STATUS_BADGE[r.status] ?? { label: r.status, variant: 'default' as const };

                  return (
                    <tr key={r.id} className={`hover:bg-muted/20 transition-colors ${isActuallyOverdue ? 'bg-destructive/5' : isOverdueSoon ? 'bg-amber-50' : ''}`}>
                      <td className="px-5 py-3 font-medium whitespace-nowrap">
                        {r.filing.businessName ?? <span className="italic text-ink-subtle">Untitled</span>}
                        <p className="text-xs text-ink-subtle font-mono">{r.filing.entityType} · {r.filing.state}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-ink-muted">
                        {r.filing.user.firstName} {r.filing.user.lastName}
                        <br />{r.filing.user.email}
                      </td>
                      <td className="px-5 py-3 text-xs font-mono">{r.filing.state}</td>
                      <td className="px-5 py-3 tabular-nums">{r.reportYear}</td>
                      <td className={`px-5 py-3 text-xs whitespace-nowrap ${isActuallyOverdue ? 'text-destructive font-semibold' : ''}`}>
                        {formatDateLong(r.dueDate)}
                        {r.filedDate && (
                          <p className="text-success text-xs">Filed {formatRelative(r.filedDate)}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-right">
                        {formatCurrency(r.filingFeeCents)}
                        {r.lateFeeCents > 0 && (
                          <p className="text-destructive text-xs">+{formatCurrency(r.lateFeeCents)} late</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          {r.status !== 'FILED' && (
                            <form action={markAnnualReportFiled.bind(null, r.id, undefined)}>
                              <Button size="sm" variant="outline" className="gap-1 text-success border-success/30 hover:bg-success/5 text-xs">
                                <CheckCircle2 className="h-3 w-3" /> Mark Filed
                              </Button>
                            </form>
                          )}
                          {r.status === 'PENDING' && (
                            <form action={markAnnualReportOverdue.bind(null, r.id)}>
                              <Button size="sm" variant="ghost" className="text-xs text-amber-600">
                                → Overdue
                              </Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`${color} opacity-70`}>{icon}</div>
        <div>
          <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">{label}</p>
          <p className="font-display text-3xl font-medium">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
