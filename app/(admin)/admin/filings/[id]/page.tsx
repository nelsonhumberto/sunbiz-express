import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Hash,
  Link2,
  Mail,
  ShieldCheck,
  Upload,
  User,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatCurrency, formatDate, formatDateLong, safeParseJson } from '@/lib/utils';
import { AdminApprovalForm } from './approval-form';
import { AdminUploadForm } from './upload-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function AdminFilingDetailPage({ params }: PageProps) {
  const t = await getTranslations('admin');
  const tDocs = await getTranslations('documentTypes');

  const TYPE_LABEL: Record<string, string> = {
    ARTICLES_ORG: tDocs('ARTICLES_ORG'),
    ARTICLES_INC: tDocs('ARTICLES_INC'),
    OPERATING_AGREEMENT: tDocs('OPERATING_AGREEMENT'),
    COVER_LETTER: tDocs('COVER_LETTER_ADMIN'),
    EIN_LETTER: tDocs('EIN_LETTER'),
    CERT_STATUS: tDocs('CERT_STATUS'),
    CERT_COPY: tDocs('CERT_COPY'),
    RECEIPT: tDocs('RECEIPT'),
  };

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      user: true,
      managersMembers: { orderBy: { position: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { generatedAt: 'desc' } },
      raServices: { orderBy: { createdAt: 'desc' }, take: 1 },
      filingAdditionalServices: { include: { service: true } },
      annualReports: { orderBy: { reportYear: 'desc' } },
    },
  });
  if (!filing) notFound();

  const principal = safeParseJson<{
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
  } | null>(filing.principalAddress, null);

  const correspondence = safeParseJson<{ email?: string; phone?: string } | null>(
    filing.correspondenceContact,
    null,
  );

  const ra = safeParseJson<{
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    useOurService?: boolean;
    signature?: string;
  } | null>(filing.registeredAgent, null);

  const totalRevenue = filing.payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((s, p) => s + p.amountCents, 0);

  const pendingDocs = filing.documents.filter((d) => d.pendingState);
  const issuedTypes = new Set(
    filing.documents.filter((d) => !d.pendingState).map((d) => d.documentType),
  );

  // Which add-on document slots could exist for this filing (so admin can
  // upload even if no placeholder row got created — e.g. legacy filings).
  const expectableUploadTypes: ('CERT_STATUS' | 'CERT_COPY' | 'EIN_LETTER')[] = [
    'CERT_STATUS',
    'CERT_COPY',
    'EIN_LETTER',
  ];

  return (
    <div className="container max-w-6xl py-10 space-y-8">
      <Link
        href="/admin/filings"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('filingsTitle')}
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white flex items-center justify-center shrink-0">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium">
              {filing.entityType === 'LLC'
                ? tDocs('floridaLLCFull')
                : tDocs('floridaCorpFull')}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight mt-1">
              {filing.businessName ?? t('untitledFiling')}
            </h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatusBadge status={filing.status} />
              <Badge variant="outline">
                <User className="h-3 w-3" />
                {filing.user.firstName} {filing.user.lastName}
              </Badge>
              {filing.sunbizFilingNumber && (
                <Badge variant="success">
                  <Hash className="h-3 w-3" />
                  <span className="font-mono">{filing.sunbizFilingNumber}</span>
                </Badge>
              )}
              {filing.filingSource === 'LINKED' ? (
                <Badge variant="secondary" className="gap-1">
                  <Link2 className="h-3 w-3" /> Linked entity
                </Badge>
              ) : (
                <Badge variant="outline">{filing.serviceTier}</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <p className="text-xs text-ink-subtle uppercase tracking-wider">{t('totalPaidLabel')}</p>
          <p className={`font-display text-2xl font-medium ${totalRevenue > 0 ? 'text-success' : 'text-ink-subtle'}`}>
            {formatCurrency(totalRevenue, { showZero: true })}
          </p>
          <p className="text-xs text-ink-subtle">
            {filing.payments.filter((p) => p.status === 'SUCCEEDED').length} payment(s)
          </p>
          <p className="text-xs text-ink-subtle">
            {t('submittedShort', {
              date: filing.submittedAt ? formatDate(filing.submittedAt) : '—',
            })}
          </p>
        </div>
      </div>

      {/* Approval form */}
      {(filing.status === 'SUBMITTED' || filing.status === 'DRAFT') && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-700" />
              {t('stateApproval')}
            </h3>
            <AdminApprovalForm
              filingId={filing.id}
              status={filing.status}
              entityType={filing.entityType as 'LLC' | 'CORP'}
              currentSunbizNumber={filing.sunbizFilingNumber ?? null}
            />
          </CardContent>
        </Card>
      )}

      {filing.status === 'APPROVED' && (
        <Card className="border-success-subtle bg-success-subtle/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="font-semibold">{t('approvedHeadline')}</p>
                <p className="text-sm text-ink-muted">
                  {t('approvedDetail', {
                    number: filing.sunbizFilingNumber ?? '—',
                    date: filing.sunbizApprovedAt ? formatDateLong(filing.sunbizApprovedAt) : '—',
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Documents (left, full set incl. cover letter) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
                {t('documents')} ({filing.documents.length})
              </h3>
              {filing.documents.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('noDocuments')}</p>
              ) : (
                <ul className="divide-y divide-border -mx-2">
                  {filing.documents.map((doc) =>
                    doc.pendingState ? (
                      <li key={doc.id} className="px-2 py-3 flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-amber-700">
                            {t('awaitingUpload', {
                              type: TYPE_LABEL[doc.documentType] ?? doc.documentType,
                            })}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          {t('pending')}
                        </Badge>
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
                            <p className="text-xs text-ink-subtle">
                              {TYPE_LABEL[doc.documentType] ?? doc.documentType} ·{' '}
                              {formatDate(doc.generatedAt)}
                              {doc.uploadedAt
                                ? ` · ${t('uploadedAt', { date: formatDate(doc.uploadedAt) })}`
                                : ''}
                            </p>
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

          {/* Upload UI for state/IRS-issued documents */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                {t('uploadStateDocs')}
              </h3>
              <p className="text-sm text-ink-muted mb-4">{t('uploadStateDocsDesc')}</p>
              <div className="space-y-4">
                {expectableUploadTypes.map((type) => {
                  const pending = pendingDocs.find((d) => d.documentType === type);
                  const issued = issuedTypes.has(type);
                  return (
                    <div key={type} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-sm">{TYPE_LABEL[type]}</p>
                          <p className="text-xs text-ink-subtle">
                            {issued
                              ? t('uploadAlreadyDesc')
                              : pending
                                ? t('uploadPendingDesc')
                                : t('uploadOptionalDesc')}
                          </p>
                        </div>
                        {issued && (
                          <Badge variant="success" size="sm">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('issued')}
                          </Badge>
                        )}
                        {!issued && pending && (
                          <Badge variant="outline" size="sm" className="border-amber-300 text-amber-700">
                            {t('pending')}
                          </Badge>
                        )}
                      </div>
                      <AdminUploadForm filingId={filing.id} documentType={type} />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: customer + filing meta */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle">
                {t('customer')}
              </h3>
              <p className="font-semibold">
                {filing.user.firstName} {filing.user.lastName}
              </p>
              <p className="text-sm text-ink-muted truncate">{filing.user.email}</p>
              {correspondence?.phone && (
                <p className="text-sm text-ink-muted">{correspondence.phone}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t('registeredAgentSection')}
              </h3>
              {ra ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{ra.name}</p>
                  <p className="text-ink-muted leading-snug">
                    {ra.street1}
                    {ra.street2 ? `, ${ra.street2}` : ''}
                    <br />
                    {ra.city}, {ra.state} {ra.zip}
                  </p>
                  {ra.useOurService ? (
                    <Badge variant="success" size="sm" className="mt-2">
                      {t('internalRA')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" size="sm" className="mt-2">
                      {t('externalRA')}
                    </Badge>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">{t('raNotConfigured')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle">
                {t('principalAddress')}
              </h3>
              {principal ? (
                <p className="text-sm leading-snug">
                  {principal.street1}
                  {principal.street2 ? `, ${principal.street2}` : ''}
                  <br />
                  {principal.city}, {principal.state} {principal.zip}
                </p>
              ) : (
                <p className="text-sm text-ink-muted">{t('addressNotSet')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle">
                {filing.entityType === 'LLC' ? t('membersTitle') : t('officersTitle')}
              </h3>
              {filing.managersMembers.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('noneListed')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {filing.managersMembers.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{m.name}</span>
                      <Badge variant="outline" size="sm">
                        {m.title}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Annual Reports */}
          {filing.annualReports.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-ink-muted" />
                  Annual Reports
                </h3>
                <ul className="space-y-3 text-sm">
                  {filing.annualReports.map((ar) => (
                    <li key={ar.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{ar.reportYear}</p>
                        <p className="text-xs text-ink-subtle">
                          Due {formatDate(ar.dueDate)}
                          {ar.filedDate ? ` · Filed ${formatDate(ar.filedDate)}` : ''}
                        </p>
                        {ar.notes && (
                          <p className="text-xs text-ink-subtle mt-0.5 italic">{ar.notes}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge
                          variant={ar.status === 'FILED' ? 'success' : ar.status === 'OVERDUE' ? 'danger' : 'outline'}
                          size="sm"
                        >
                          {ar.status}
                        </Badge>
                        {ar.totalCostCents > 0 && (
                          <p className="text-xs font-medium mt-1">{formatCurrency(ar.totalCostCents)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Payments */}
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-ink-muted" />
                {t('payment')}
              </h3>
              {filing.payments.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('noPayments')}</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {filing.payments.map((p) => (
                    <li key={p.id} className="py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs">{p.cardBrand} •••• {p.cardLast4}</span>
                        <span className={`font-semibold ${p.status === 'SUCCEEDED' ? 'text-success' : 'text-ink-muted'}`}>
                          {formatCurrency(p.amountCents, { showZero: true })}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-ink-subtle">
                        <span>{p.status} · {formatDate(p.completedAt ?? p.createdAt)}</span>
                      </div>
                      {/* Breakdown */}
                      {p.stateFilingFeeCents > 0 && (
                        <div className="text-xs text-ink-subtle space-y-0.5 pt-1 border-t border-border">
                          <div className="flex justify-between"><span>State fee</span><span>{formatCurrency(p.stateFilingFeeCents)}</span></div>
                          {p.formationServiceFeeCents > 0 && <div className="flex justify-between"><span>Service fee</span><span>{formatCurrency(p.formationServiceFeeCents)}</span></div>}
                          {p.registeredAgentY1Cents > 0 && <div className="flex justify-between"><span>Registered Agent</span><span>{formatCurrency(p.registeredAgentY1Cents)}</span></div>}
                        </div>
                      )}
                    </li>
                  ))}
                  <li className="pt-2 flex justify-between font-semibold text-sm">
                    <span>Total revenue</span>
                    <span className="text-success">{formatCurrency(totalRevenue)}</span>
                  </li>
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
                <Mail className="h-4 w-4 text-ink-muted" />
                {t('addOns')}
              </h3>
              {filing.filingAdditionalServices.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('noAddOns')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {filing.filingAdditionalServices.map((fas) => (
                    <li key={fas.id} className="flex justify-between">
                      <span>{fas.service.serviceName}</span>
                      <span className="font-mono text-xs text-ink-muted">
                        {formatCurrency(fas.priceCents, { showZero: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
