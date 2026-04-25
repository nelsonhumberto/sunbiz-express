import Link from 'next/link';
import { Building2, Users, DollarSign, TrendingUp, Mail } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const [
    totalFilings,
    activeFilings,
    totalUsers,
    totalRevenueData,
    recentFilings,
    recentEmails,
  ] = await Promise.all([
    prisma.filing.count(),
    prisma.filing.count({ where: { status: { in: ['SUBMITTED', 'APPROVED'] } } }),
    prisma.user.count(),
    prisma.payment.aggregate({
      _sum: { amountCents: true },
      where: { status: 'SUCCEEDED' },
    }),
    prisma.filing.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: { user: true },
    }),
    prisma.emailNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const totalRevenue = totalRevenueData._sum.amountCents ?? 0;

  return (
    <div className="container max-w-7xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Admin overview</h1>
        <p className="mt-2 text-ink-muted">
          Operational health of Sunbiz Express.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Building2 className="h-5 w-5" />}
          label="Total filings"
          value={String(totalFilings)}
          accent="primary"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="In progress / approved"
          value={String(activeFilings)}
          accent="success"
        />
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          label="Total users"
          value={String(totalUsers)}
          accent="accent"
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Lifetime revenue"
          value={formatCurrency(totalRevenue, { showZero: true })}
          accent="primary"
        />
      </div>

      {/* Recent filings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold">Recent filings</h2>
              <Link href="/admin/filings" className="text-sm text-primary hover:underline">
                View all →
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {recentFilings.length === 0 ? (
                <li className="px-6 py-8 text-center text-sm text-ink-muted">
                  No filings yet.
                </li>
              ) : (
                recentFilings.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/admin/filings`}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {f.businessName ?? 'Untitled draft'}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          {f.user.email} · {formatRelative(f.updatedAt)}
                        </p>
                      </div>
                      <StatusBadge status={f.status} />
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Outbox
              </h2>
              <Link href="/admin/outbox" className="text-sm text-primary hover:underline">
                All →
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {recentEmails.length === 0 ? (
                <li className="px-6 py-8 text-center text-sm text-ink-muted">
                  No emails sent yet.
                </li>
              ) : (
                recentEmails.map((e) => (
                  <li key={e.id} className="px-6 py-3">
                    <p className="text-sm font-medium truncate">{e.subject}</p>
                    <p className="text-xs text-ink-muted truncate">
                      → {e.recipientEmail} · {formatRelative(e.createdAt)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'primary' | 'accent' | 'success';
}) {
  const accentClass =
    accent === 'primary'
      ? 'bg-primary/10 text-primary'
      : accent === 'accent'
        ? 'bg-accent/15 text-accent-700'
        : 'bg-success-subtle text-success';
  return (
    <Card>
      <CardContent className="p-5">
        <div
          className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${accentClass}`}
        >
          {icon}
        </div>
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">{label}</p>
        <p className="font-display text-3xl font-medium mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}
