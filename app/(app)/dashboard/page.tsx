import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Plus,
  ArrowRight,
  Building2,
  Sparkles,
  CalendarDays,
  ShieldCheck,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, formatDate, formatRelative, safeParseJson } from '@/lib/utils';
import { TOTAL_STEPS } from '@/lib/wizard-constants';
import { StartFilingButton } from './start-filing-button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const [filings, upcomingReports] = await Promise.all([
    prisma.filing.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        documents: { select: { id: true } },
        annualReports: { where: { status: 'PENDING' }, take: 1, orderBy: { dueDate: 'asc' } },
      },
    }),
    prisma.annualReport.findMany({
      where: { filing: { userId: session.user.id }, status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
      include: { filing: true },
      take: 5,
    }),
  ]);

  const drafts = filings.filter((f) => f.status === 'DRAFT');
  const active = filings.filter((f) => f.status !== 'DRAFT');

  return (
    <div className="container max-w-6xl py-10 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-ink-subtle">
            {greet()},{' '}
            <span className="text-ink font-medium">
              {session.user.name?.split(' ')[0]}
            </span>
          </p>
          <h1 className="font-display text-4xl font-medium tracking-tight mt-1">
            Your business hub
          </h1>
        </div>
        <StartFilingButton />
      </div>

      {/* Empty state */}
      {filings.length === 0 && <EmptyState />}

      {/* Drafts in progress */}
      {drafts.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="In progress" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drafts.map((filing) => (
              <DraftCard key={filing.id} filing={filing} />
            ))}
          </div>
        </section>
      )}

      {/* Active filings */}
      {active.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Your businesses" />
          <div className="space-y-3">
            {active.map((filing) => (
              <ActiveFilingCard key={filing.id} filing={filing} />
            ))}
          </div>
        </section>
      )}

      {/* Compliance preview */}
      {upcomingReports.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="Upcoming compliance" linkHref="/dashboard/compliance" linkLabel="View all" />
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {upcomingReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/dashboard/filings/${report.filingId}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-10 w-10 rounded-md bg-warn-subtle text-warn flex items-center justify-center">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {report.filing.businessName} · Annual Report
                    </p>
                    <p className="text-xs text-ink-muted">
                      Due {formatDate(report.dueDate, { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
                      · ${(report.filingFeeCents / 100).toFixed(2)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-subtle" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function SectionHeader({
  title,
  linkHref,
  linkLabel,
}: {
  title: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
        {title}
      </h2>
      {linkHref && linkLabel && (
        <Link href={linkHref} className="text-sm font-medium text-primary hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-white p-10 md:p-16 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="font-display text-2xl font-medium">Welcome aboard.</h2>
      <p className="mt-2 text-ink-muted max-w-md mx-auto">
        Form your first Florida business in under 15 minutes — we'll guide you through every step.
      </p>
      <div className="mt-6">
        <StartFilingButton />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Free Year-1 Registered Agent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Filed in 1 business day
        </span>
      </div>
    </div>
  );
}

function DraftCard({ filing }: { filing: any }) {
  const completedSteps = safeParseJson<number[]>(filing.completedSteps, []);
  const progress = (completedSteps.length / TOTAL_STEPS) * 100;
  const stepRoute = filing.currentStep ?? 1;

  return (
    <Card className="hover:shadow-card transition-shadow group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">
              {filing.entityType === 'LLC' ? 'Florida LLC' : 'Florida Corporation'}
            </p>
            <p className="font-display text-lg font-medium truncate mt-0.5">
              {filing.businessName ?? 'Untitled draft'}
            </p>
          </div>
          <StatusBadge status={filing.status} />
        </div>

        <div className="space-y-1.5 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted">
              Step {filing.currentStep} of {TOTAL_STEPS}
            </span>
            <span className="text-ink-muted">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-subtle">
            Last updated {formatRelative(filing.updatedAt)}
          </span>
          <Button asChild size="sm" className="group/btn">
            <Link href={`/wizard/${filing.id}/${stepRoute}`}>
              Continue
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveFilingCard({ filing }: { filing: any }) {
  return (
    <Link
      href={`/dashboard/filings/${filing.id}`}
      className="group block rounded-2xl border border-border bg-white p-5 hover:shadow-card transition-shadow"
    >
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-lg font-medium truncate">{filing.businessName}</p>
            <StatusBadge status={filing.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <span>{filing.entityType === 'LLC' ? 'Florida LLC' : 'Florida Corp.'}</span>
            <span>·</span>
            <span>{filing.documents.length} documents</span>
            {filing.sunbizFilingNumber && (
              <>
                <span>·</span>
                <span className="font-mono">#{filing.sunbizFilingNumber}</span>
              </>
            )}
            <span>·</span>
            <span>{formatCurrency(filing.totalCents)}</span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-ink-subtle group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}
