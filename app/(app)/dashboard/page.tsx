import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
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
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency, formatDate, formatRelative, safeParseJson } from '@/lib/utils';
import {
  TOTAL_DISPLAYED_STEPS,
  displayStepNumber,
} from '@/lib/wizard-constants';
import { StartFilingButton } from './start-filing-button';
import { AddExistingCompanyButton } from '@/components/dashboard/AddExistingCompanyButton';
import { ArchiveDraftButton } from '@/components/dashboard/ArchiveDraftButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const t = await getTranslations('dashboard');

  const now = Date.now();
  const raRenewalHorizon = new Date(now + 60 * 24 * 60 * 60 * 1000);

  const [filings, upcomingReports, upcomingRaRenewals] = await Promise.all([
    prisma.filing.findMany({
      // Hide drafts the customer chose to remove from their dashboard.
      // Submitted/approved/etc. filings always stay visible — only DRAFTs
      // can be archived (see actions/dashboard.ts). The row itself is
      // preserved for admin retention reporting.
      where: {
        userId: session.user.id,
        OR: [
          { userArchivedAt: null },
          { status: { not: 'DRAFT' } },
        ],
      },
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
    // Surface in-flight Registered-Agent renewals so the customer can renew
    // (or cancel) before lapse without us emailing only.
    prisma.registeredAgentService.findMany({
      where: {
        filing: { userId: session.user.id },
        status: 'ACTIVE',
        serviceProvider: 'INTERNAL',
        renewalDate: { gte: new Date(now), lte: raRenewalHorizon },
      },
      orderBy: { renewalDate: 'asc' },
      include: { filing: true },
      take: 3,
    }),
  ]);

  const drafts = filings.filter((f) => f.status === 'DRAFT');
  const active = filings.filter((f) => f.status !== 'DRAFT');
  // The freshest draft drives a prominent hero CTA so customers can pick up
  // exactly where they left off without hunting through the cards below.
  const latestDraft = drafts[0];
  const latestDraftCompleted = latestDraft
    ? safeParseJson<number[]>(latestDraft.completedSteps, []).length
    : 0;

  const h = new Date().getHours();
  const greet = h < 12 ? t('greetMorning') : h < 18 ? t('greetAfternoon') : t('greetEvening');

  return (
    <div className="container max-w-6xl py-10 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-ink-subtle">
            {greet},{' '}
            <span className="text-ink font-medium">{session.user.name?.split(' ')[0]}</span>
          </p>
          <h1 className="font-display text-4xl font-medium tracking-tight mt-1">{t('title')}</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <AddExistingCompanyButton />
          <StartFilingButton />
        </div>
      </div>

      {filings.length === 0 && <EmptyState />}

      {latestDraft && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-white to-white shadow-card">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0">
                <ArrowRight className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider text-primary font-semibold">
                  {t('resumeEyebrow')}
                </p>
                <h2 className="font-display text-2xl font-medium mt-1">
                  {latestDraft.businessName ?? t('untitledDraft')}
                </h2>
                <p className="text-sm text-ink-muted mt-1">
                  {t('resumeStepHint', {
                    current:
                      displayStepNumber(latestDraft.currentStep ?? 1) ??
                      TOTAL_DISPLAYED_STEPS,
                    total: TOTAL_DISPLAYED_STEPS,
                    completed: Math.min(latestDraftCompleted, TOTAL_DISPLAYED_STEPS),
                  })}
                </p>
                <p className="text-sm text-primary font-medium mt-1.5 inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {t('resumeUrgency')}
                </p>
                <div className="mt-3 max-w-md">
                  <Progress
                    value={
                      (Math.min(latestDraftCompleted, TOTAL_DISPLAYED_STEPS) /
                        TOTAL_DISPLAYED_STEPS) *
                      100
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <ArchiveDraftButton filingId={latestDraft.id} iconOnly />
                <Link
                  href={`/wizard/${latestDraft.id}/${latestDraft.currentStep ?? 1}`}
                  className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-md font-semibold hover:bg-primary-hover transition-colors"
                >
                  {t('resumeFiling')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {drafts.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title={t('inProgress')} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drafts.map((filing) => (
              <DraftCard key={filing.id} filing={filing} />
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title={t('yourBusinesses')} />
          <div className="space-y-3">
            {active.map((filing) => (
              <ActiveFilingCard key={filing.id} filing={filing} />
            ))}
          </div>
        </section>
      )}

      {upcomingReports.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title={t('upcomingCompliance')}
            linkHref="/dashboard/compliance"
            linkLabel="→"
          />
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
                      {report.filing.businessName} · {t('annualReport')}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t('due')}{' '}
                      {formatDate(report.dueDate, { month: 'long', day: 'numeric', year: 'numeric' })}{' '}
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

      {upcomingRaRenewals.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title={t('upcomingRaRenewals')} />
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {upcomingRaRenewals.map((svc) => (
                <Link
                  key={svc.id}
                  href={`/dashboard/filings/${svc.filingId}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {svc.filing.businessName} · {t('raRenewal')}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t('renewsOn')}{' '}
                      {formatDate(svc.renewalDate, {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}{' '}
                      · {t('raRenewalPrice')}
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">{title}</h2>
      {linkHref && linkLabel && (
        <Link href={linkHref} className="text-sm font-medium text-primary hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

async function EmptyState() {
  const t = await getTranslations('dashboard');
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-white p-10 md:p-16 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="font-display text-2xl font-medium">{t('emptyTitle')}</h2>
      <p className="mt-2 text-ink-muted max-w-md mx-auto">{t('emptyBody')}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <AddExistingCompanyButton />
        <StartFilingButton />
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {t('freeRA')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {t('filed1Day')}
        </span>
      </div>
    </div>
  );
}

async function DraftCard({ filing }: { filing: any }) {
  const t = await getTranslations('dashboard');
  const completedSteps = safeParseJson<number[]>(filing.completedSteps, []);
  const visibleCompleted = Math.min(completedSteps.length, TOTAL_DISPLAYED_STEPS);
  const progress = (visibleCompleted / TOTAL_DISPLAYED_STEPS) * 100;
  const stepRoute = filing.currentStep ?? 1;
  const visibleCurrent =
    displayStepNumber(filing.currentStep ?? 1) ?? TOTAL_DISPLAYED_STEPS;

  return (
    <Card className="hover:shadow-card transition-shadow group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">
              {filing.entityType === 'LLC' ? 'Florida LLC' : 'Florida Corporation'}
            </p>
            <p className="font-display text-lg font-medium truncate mt-0.5">
              {filing.businessName ?? t('untitledDraft')}
            </p>
          </div>
          <StatusBadge status={filing.status} />
        </div>

        <div className="space-y-1.5 mb-4">
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted">
              {t('step', { current: visibleCurrent, total: TOTAL_DISPLAYED_STEPS })}
            </span>
            <span className="text-ink-muted">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-subtle">
            {t('lastUpdated', { time: formatRelative(filing.updatedAt) })}
          </span>
          <div className="flex items-center gap-1">
            <ArchiveDraftButton filingId={filing.id} iconOnly />
            <Link
              href={`/wizard/${filing.id}/${stepRoute}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary-hover transition-colors"
            >
              {t('continueBtn')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function ActiveFilingCard({ filing }: { filing: any }) {
  const t = await getTranslations('dashboard');
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
            <span>
              {filing.documents.length} {t('documents')}
            </span>
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
