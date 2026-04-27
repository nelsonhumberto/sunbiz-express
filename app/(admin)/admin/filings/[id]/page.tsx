import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Hash,
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
              <Badge variant="outline">{filing.serviceTier}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <p className="text-xs text-ink-subtle uppercase tracking-wider">{t('totalPaidLabel')}</p>
          <p className="font-display text-2xl font-medium">
            {formatCurrency(filing.totalCents, { showZero: true })}
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

          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-subtle flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-ink-muted" />
                {t('payment')}
              </h3>
              {filing.payments.length === 0 ? (
                <p className="text-sm text-ink-muted">{t('noPayments')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {filing.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <span>
                        <span className="font-mono text-xs">
                          {p.cardBrand} •••• {p.cardLast4}
                        </span>{' '}
                        · {p.status}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(p.amountCents, { showZero: true })}
                      </span>
                    </li>
                  ))}
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
