import Link from 'next/link';
import { ArrowUpRight, Download, EyeOff, AlertCircle } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatRelative, safeParseJson } from '@/lib/utils';
import {
  STEP_NAMES,
  TOTAL_DISPLAYED_STEPS,
  displayStepNumber,
} from '@/lib/wizard-constants';

export const dynamic = 'force-dynamic';

interface AdminDraftsPageProps {
  searchParams?: { archived?: string };
}

export default async function AdminDraftsPage({ searchParams }: AdminDraftsPageProps) {
  const showArchived = searchParams?.archived === '1';

  // Surface every DRAFT filing, including those the customer chose to hide
  // from their dashboard, so the team can measure abandonment and reach out.
  const drafts = await prisma.filing.findMany({
    where: { status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      payments: { select: { id: true, status: true } },
    },
  });

  const visible = drafts.filter((d) => !d.userArchivedAt);
  const archived = drafts.filter((d) => d.userArchivedAt);
  const list = showArchived ? archived : visible;

  // Distribution of where customers drop off, regardless of archive status.
  const stuckStepCounts = new Map<number, number>();
  for (const d of drafts) {
    const step = d.currentStep ?? 1;
    stuckStepCounts.set(step, (stuckStepCounts.get(step) ?? 0) + 1);
  }
  const topStuckSteps = [...stuckStepCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="container max-w-7xl py-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Drafts &amp; abandoned filings
          </h1>
          <p className="mt-1 text-ink-muted">
            Every customer who started a filing — including those who removed
            it from their own dashboard. Used for retention outreach and
            funnel analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/drafts/export">
              <Download className="h-4 w-4" />
              Download CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="All-time drafts" value={String(drafts.length)} />
        <KpiCard label="On dashboards" value={String(visible.length)} />
        <KpiCard
          label="Hidden by user"
          value={String(archived.length)}
          accent="warn"
        />
        <KpiCard
          label="Top drop-off step"
          value={
            topStuckSteps[0]
              ? `${displayStepNumber(topStuckSteps[0][0]) ?? '—'} · ${topStuckSteps[0][1]} draft${topStuckSteps[0][1] === 1 ? '' : 's'}`
              : '—'
          }
        />
      </div>

      {topStuckSteps.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
              Where people stop
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {topStuckSteps.map(([step, count]) => {
                const meta = STEP_NAMES[step];
                const display = displayStepNumber(step);
                return (
                  <div
                    key={step}
                    className="rounded-lg border border-border p-3 bg-surface"
                  >
                    <p className="text-xs text-ink-subtle">
                      {display ? `Step ${display} of ${TOTAL_DISPLAYED_STEPS}` : 'Bonus step'}
                    </p>
                    <p className="font-medium text-sm mt-0.5">
                      {meta?.title ?? `Step ${step}`}
                    </p>
                    <p className="text-xs text-ink-muted mt-1">
                      {count} draft{count === 1 ? '' : 's'} stalled here
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 text-sm">
        <FilterPill
          href="/admin/drafts"
          label={`On dashboards (${visible.length})`}
          active={!showArchived}
        />
        <FilterPill
          href="/admin/drafts?archived=1"
          label={`Hidden by user (${archived.length})`}
          active={showArchived}
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <Th>Business</Th>
                <Th>Customer</Th>
                <Th>Stuck on</Th>
                <Th>Progress</Th>
                <Th>Started</Th>
                <Th>Last activity</Th>
                <Th className="text-right">Open</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-ink-muted">
                    No drafts in this view.
                  </td>
                </tr>
              ) : (
                list.map((filing) => {
                  const completedSteps = safeParseJson<number[]>(
                    filing.completedSteps,
                    [],
                  );
                  const visibleCompleted = Math.min(
                    completedSteps.length,
                    TOTAL_DISPLAYED_STEPS,
                  );
                  const progressPct =
                    (visibleCompleted / TOTAL_DISPLAYED_STEPS) * 100;
                  const stepRoute = filing.currentStep ?? 1;
                  const stepMeta = STEP_NAMES[stepRoute];
                  const stepDisplay = displayStepNumber(stepRoute);
                  const paid = filing.payments.some(
                    (p) => p.status === 'SUCCEEDED',
                  );

                  return (
                    <tr
                      key={filing.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/filings/${filing.id}`}
                          className="font-medium hover:text-primary inline-flex items-center gap-1.5"
                        >
                          {filing.businessName ?? (
                            <span className="italic text-ink-subtle">
                              untitled
                            </span>
                          )}
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-ink-subtle font-mono">
                            {filing.entityType} · {filing.id.slice(0, 8)}
                          </span>
                          {filing.userArchivedAt && (
                            <Badge variant="warn">
                              <EyeOff className="h-3 w-3" />
                              Hidden by user
                            </Badge>
                          )}
                          {paid && (
                            <Badge variant="success">
                              <AlertCircle className="h-3 w-3" />
                              Paid (review!)
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium">
                          {filing.user.firstName} {filing.user.lastName}
                        </p>
                        <p className="text-xs text-ink-subtle truncate max-w-[18ch]">
                          {filing.user.email}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm">
                          {stepDisplay
                            ? `Step ${stepDisplay} of ${TOTAL_DISPLAYED_STEPS}`
                            : 'Bonus step'}
                        </p>
                        <p className="text-xs text-ink-subtle truncate max-w-[24ch]">
                          {stepMeta?.title ?? `Step ${stepRoute}`}
                        </p>
                      </td>
                      <td className="px-6 py-4 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <Progress value={progressPct} className="h-1.5" />
                          <span className="text-xs text-ink-subtle shrink-0">
                            {visibleCompleted}/{TOTAL_DISPLAYED_STEPS}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-ink-muted text-xs">
                        {formatRelative(filing.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-ink-muted text-xs">
                        {formatRelative(filing.updatedAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/filings/${filing.id}`}>Open</Link>
                        </Button>
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

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left px-6 py-3 font-medium text-ink-muted text-xs uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
}

function FilterPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'inline-flex items-center px-3 py-1.5 rounded-full bg-primary text-white font-medium'
          : 'inline-flex items-center px-3 py-1.5 rounded-full bg-muted text-ink-muted hover:bg-muted/80'
      }
    >
      {label}
    </Link>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'warn';
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">
          {label}
        </p>
        <p
          className={`font-display text-3xl font-medium mt-0.5 ${accent === 'warn' ? 'text-warn' : ''}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
