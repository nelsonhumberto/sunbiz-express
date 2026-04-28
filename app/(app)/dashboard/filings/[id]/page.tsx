import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  ShieldCheck,
  User,
  Hash,
  CreditCard,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, formatDate, formatDateLong, safeParseJson } from '@/lib/utils';
import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import { FL } from '@/lib/florida';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function FilingDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const t = await getTranslations('filingDetail');
  const tWizard = await getTranslations('wizard');
  const tDocs = await getTranslations('documentTypes');

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      managersMembers: { orderBy: { position: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { generatedAt: 'desc' } },
      raServices: { orderBy: { createdAt: 'desc' }, take: 1 },
      annualReports: { orderBy: { dueDate: 'asc' } },
      filingAdditionalServices: { include: { service: true } },
    },
  });
  if (!filing || filing.userId !== session.user.id) notFound();

  // Hide Operating Agreements from Basic Filing customers who didn't add the
  // OA service. Legacy filings may still have an OPERATING_AGREEMENT row
  // from before the entitlement check existed.
  const filingAddOnSlugs = filing.filingAdditionalServices.map(
    (fas) => fas.service.serviceSlug as AddOnSlug,
  );
  const oaEntitled =
    filing.entityType === 'LLC' &&
    filingHasOperatingAgreement({
      tier: filing.serviceTier as TierSlug,
      addOnSlugs: filingAddOnSlugs,
      memberCount: filing.managersMembers.length,
    });
  const visibleDocuments = filing.documents.filter((d) => {
    if (d.documentType === 'COVER_LETTER') return false;
    if (d.documentType === 'OPERATING_AGREEMENT' && !oaEntitled) return false;
    return true;
  });

  const principal = safeParseJson<{
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
  } | null>(filing.principalAddress, null);

  const correspondence = safeParseJson<{ email?: string; phone?: string } | null>(
    filing.correspondenceContact,
    null
  );

  const ra = safeParseJson<{
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    useOurService?: boolean;
    agentCountry?: string;
  } | null>(filing.registeredAgent, null);

  const nonUsRegisteredAgent =
    !!ra?.agentCountry && ra.agentCountry !== 'US' && ra.agentCountry !== '';

  return (
    <div className="container max-w-5xl py-10 space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('allFilings')}
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">
              {filing.entityType === 'LLC' ? tDocs('floridaLLCFull') : tDocs('floridaCorpFull')}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight mt-1">
              {filing.businessName}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusBadge status={filing.status} />
              {filing.filingSource === 'LINKED' && (
                <Badge variant="secondary">{t('linkedEntityBadge')}</Badge>
              )}
              {filing.sunbizFilingNumber && (
                <Badge variant="outline">
                  <Hash className="h-3 w-3" />
                  <span className="font-mono">{filing.sunbizFilingNumber}</span>
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/documents">
            <Download className="h-4 w-4" />
            {t('allDocuments')}
          </Link>
        </Button>
      </div>

      {/* Annual report action card */}
      {(filing.status === 'APPROVED' || filing.filingSource === 'LINKED') && (() => {
        const filedReport = filing.annualReports.find((r) => r.status === 'FILED');
        const pendingReport = filing.annualReports.find(
          (r) => r.status === 'PENDING' || r.status === 'OVERDUE',
        );
        return (
          <div className="space-y-4">
            {/* Filed confirmation receipt */}
            {filedReport && (
              <Card className="border-success/30 bg-success-subtle/20">
                <CardContent className="p-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <h3 className="font-semibold text-ink">{t('arFiledTitle')}</h3>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {t('arFiledBody', { year: filedReport.reportYear })}
                  </p>
                  <div className="text-xs text-ink-subtle space-y-0.5 pt-1">
                    <p>{t('arFiledDate')}: {filedReport.filedDate ? formatDate(filedReport.filedDate) : '—'}</p>
                    <p>{t('arFiledAmount')}: {formatCurrency(filedReport.totalCostCents)}</p>
                    {filedReport.notes && <p>{filedReport.notes}</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* File / pending CTA */}
            {pendingReport && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6 space-y-3">
                  <h3 className="font-semibold text-ink">{t('linkedAnnualTitle')}</h3>
                  <p className="text-sm text-ink-muted">{t('linkedAnnualBody')}</p>
                  <Button asChild>
                    <Link href={`/dashboard/filings/${filing.id}/annual-report`}>
                      {t('fileAnnualReport')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Show file button even when no report row exists yet */}
            {!pendingReport && !filedReport && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6 space-y-3">
                  <h3 className="font-semibold text-ink">{t('linkedAnnualTitle')}</h3>
                  <p className="text-sm text-ink-muted">{t('linkedAnnualBody')}</p>
                  <Button asChild>
                    <Link href={`/dashboard/filings/${filing.id}/annual-report`}>
                      {t('fileAnnualReport')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {nonUsRegisteredAgent && (
              <Card className="border-warn/30 bg-warn-subtle/30">
                <CardContent className="p-6 space-y-2">
                  <h3 className="font-semibold text-ink">{t('nonUsRaTitle')}</h3>
                  <p className="text-sm text-ink-muted">{t('nonUsRaBody')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* Status timeline */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
            {t('filingTimeline')}
          </h3>
          <div className="space-y-4">
            <TimelineEvent
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={t('submittedToState')}
              detail={
                filing.sunbizSubmittedAt
                  ? formatDateLong(filing.sunbizSubmittedAt)
                  : t('filingPending')
              }
              done={!!filing.sunbizSubmittedAt}
            />
            <TimelineEvent
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={t('stateApproved')}
              detail={
                filing.sunbizApprovedAt
                  ? formatDateLong(filing.sunbizApprovedAt)
                  : t('approvalEstimate')
              }
              done={!!filing.sunbizApprovedAt}
            />
            <TimelineEvent
              icon={<FileText className="h-4 w-4" />}
              title={t('documentsAvailable')}
              detail={
                visibleDocuments.length > 0
                  ? t('documentsReadyPendingMix', {
                      ready: visibleDocuments.filter((d) => !d.pendingState).length,
                      pending: visibleDocuments.filter((d) => d.pendingState).length,
                    })
                  : t('documentsPending')
              }
              done={visibleDocuments.some((d) => !d.pendingState)}
            />
            <TimelineEvent
              icon={<Calendar className="h-4 w-4" />}
              title={t('nextAnnualReport')}
              detail={
                filing.annualReports[0]
                  ? t('dueDateOn', { date: formatDateLong(filing.annualReports[0].dueDate) })
                  : t('annualReportEstimate')
              }
              done={false}
            />
          </div>
        </CardContent>
      </Card>

      {/* Two-column details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              {t('documentsTitle')}
            </h3>
            {visibleDocuments.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('noDocuments')}</p>
            ) : (
              <ul className="divide-y divide-border -mx-2">
                {visibleDocuments.map((doc) =>
                  doc.pendingState ? (
                    <li key={doc.id}>
                      <div className="flex items-center gap-3 px-2 py-3 rounded-md bg-amber-50/40">
                        <div className="h-9 w-9 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-amber-700">{tWizard('documentPendingState')}</p>
                        </div>
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          {t('filingPending')}
                        </Badge>
                      </div>
                    </li>
                  ) : (
                    <li key={doc.id}>
                      <Link
                        href={`/api/documents/${doc.id}`}
                        target="_blank"
                        className="flex items-center gap-3 px-2 py-3 hover:bg-muted/30 rounded-md transition-colors"
                      >
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-ink-subtle">{formatDate(doc.generatedAt)}</p>
                        </div>
                        <Download className="h-4 w-4 text-ink-subtle" />
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Registered agent */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {tWizard('registeredAgent')}
            </h3>
            {ra && (
              <div className="space-y-2">
                <p className="font-semibold">{ra.name}</p>
                <p className="text-sm text-ink-muted leading-snug">
                  {ra.street1}
                  {ra.street2 ? `, ${ra.street2}` : ''}
                  <br />
                  {ra.city}, {ra.state} {ra.zip}
                </p>
                {ra.useOurService && (
                  <Badge variant="success" className="mt-2">
                    {t('freeYearIncluded')}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Principal address */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              {t('principalAddress')}
            </h3>
            {principal && (
              <p className="text-sm text-ink leading-snug">
                {principal.street1}
                {principal.street2 ? `, ${principal.street2}` : ''}
                <br />
                {principal.city}, {principal.state} {principal.zip}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              {filing.entityType === 'LLC' ? t('membersTitle') : t('officersTitle')}
            </h3>
            <ul className="space-y-2">
              {filing.managersMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border last:border-b-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3.5 w-3.5 text-ink-subtle shrink-0" />
                    <span className="font-medium truncate">{m.name}</span>
                    <Badge variant="outline" size="sm">{m.title}</Badge>
                  </div>
                  {m.ownershipPercentage != null && (
                    <span className="text-xs text-ink-muted shrink-0">{m.ownershipPercentage.toFixed(1)}%</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Correspondence */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
              {t('correspondenceTitle')}
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-ink-subtle" />
                <span className="font-mono">{correspondence?.email ?? '—'}</span>
              </div>
              {correspondence?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{correspondence.phone}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-ink-muted" />
              {t('payment')}
            </h3>
            {(() => {
              const succeeded = filing.payments.filter((p) => p.status === 'SUCCEEDED');
              const totalPaid = succeeded.reduce((s, p) => s + p.amountCents, 0);
              const latest = succeeded[0];
              if (succeeded.length === 0) {
                return <p className="text-sm text-ink-muted">{t('noPayments')}</p>;
              }
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">{t('totalPaid')}</span>
                    <span className="font-semibold">{formatCurrency(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">{t('method')}</span>
                    <span className="font-mono text-xs">
                      {latest.cardBrand} •••• {latest.cardLast4}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">{t('date')}</span>
                    <span>{formatDate(latest.completedAt ?? latest.createdAt)}</span>
                  </div>
                  {succeeded.length > 1 && (
                    <p className="text-xs text-ink-subtle">{succeeded.length} payments total</p>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TimelineEvent({
  icon,
  title,
  detail,
  done,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  done: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          done ? 'bg-success-subtle text-success' : 'bg-muted text-ink-subtle'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${done ? 'text-ink' : 'text-ink-muted'}`}>{title}</p>
        <p className="text-xs text-ink-subtle">{detail}</p>
      </div>
    </div>
  );
}
