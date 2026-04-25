import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, formatRelative } from '@/lib/utils';
import { AdvanceStatusButton } from './advance-status-button';

export const dynamic = 'force-dynamic';

export default async function AdminFilingsPage() {
  const filings = await prisma.filing.findMany({
    include: { user: true, _count: { select: { documents: true, payments: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">All filings</h1>
        <p className="mt-1 text-ink-muted">
          {filings.length} total · use the advance button to simulate state processing.
        </p>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  Business
                </th>
                <th className="text-left px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  User
                </th>
                <th className="text-left px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  Tier
                </th>
                <th className="text-right px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-left px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  Updated
                </th>
                <th className="text-right px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-ink-muted">
                    No filings yet.
                  </td>
                </tr>
              ) : (
                filings.map((filing) => (
                  <tr key={filing.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/filings/${filing.id}`}
                        className="font-medium hover:text-primary inline-flex items-center gap-1.5"
                      >
                        {filing.businessName ?? <span className="italic text-ink-subtle">untitled</span>}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                      <p className="text-xs text-ink-subtle font-mono">
                        {filing.entityType} · {filing.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium">
                        {filing.user.firstName} {filing.user.lastName}
                      </p>
                      <p className="text-xs text-ink-subtle">{filing.user.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={filing.status} />
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline">{filing.serviceTier}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {formatCurrency(filing.totalCents, { showZero: true })}
                    </td>
                    <td className="px-6 py-4 text-ink-muted text-xs">
                      {formatRelative(filing.updatedAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(filing.status === 'SUBMITTED' || filing.status === 'DRAFT') && (
                        <AdvanceStatusButton filingId={filing.id} status={filing.status} />
                      )}
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
