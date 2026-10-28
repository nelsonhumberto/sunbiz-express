import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { hrefForLocale } from '@/lib/app-href';
import { redirectLocalized } from '@/lib/locale-redirect';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Award,
  FileCheck,
  FileText,
  Mail,
  ShieldCheck,
  User,
  Hash,
  CreditCard,
  Landmark,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { formatRaRenewalPrice } from '@/lib/ra-renewal-price';
import { formatCurrency, formatDate, formatDateLong, safeParseJson } from '@/lib/utils';
import { fillDueMessage } from '@/lib/due-label';
import {
  ADD_ON_BY_SLUG,
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';
import {
  getFormationState,
  isActiveFormationState,
  type StateCode,
} from '@/lib/formation-states';
import { canOrderEin, filingIncludesEin } from '@/lib/ein';
import {
  CERTIFICATE_ADDON_SLUGS,
  certificateOffer,
  certificateOrderPath,
  certificateOrderQuote,
  displayedCertificateTitle,
  filingEntityType,
  filingFormationState,
} from '@/lib/certificate-addons';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function FilingDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return await redirectLocalized('/sign-in');
  const t = await getTranslations('filingDetail');
  const tWizard = await getTranslations('wizard');
  const tDocs = await getTranslations('documentTypes');
  const tEin = await getTranslations('einForm');
  const tCert = await getTranslations('certificates');

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      managersMembers: { orderBy: { position: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { generatedAt: 'desc' } },
      raServices: {
        where: { serviceProvider: 'INTERNAL', status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      annualReports: { orderBy: { dueDate: 'asc' } },
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
    },
  });
  if (!filing || filing.userId !== session.user.id) notFound();
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';
  const documentTitles: Record<string, string> = {
    ARTICLES_ORG: tDocs('ARTICLES_ORG'),
    ARTICLES_INC: tDocs('ARTICLES_INC'),
    OPERATING_AGREEMENT: tDocs('OPERATING_AGREEMENT'),
    COVER_LETTER: tDocs('COVER_LETTER'),
    SUNBIZ_COVER_PAGE: tDocs('SUNBIZ_COVER_PAGE'),
    FILE_PACKAGE: tDocs('FILE_PACKAGE'),
    EIN_LETTER: tEin('docEinLetter'),
    CERT_STATUS: tDocs('CERT_STATUS'),
    CERT_COPY: tDocs('CERT_COPY'),
    RECEIPT: tDocs('RECEIPT'),
  };

  // Resolve the formation state - defaults to FL for legacy filings that
  // pre-date the multi-state launch. We use the registry for state-specific
  // labels (Articles of Organization vs Certificate of Formation, "Annual
  // Report" vs "Annual Tax", etc.) instead of hardcoding Florida copy.
  const stateCode: StateCode = isActiveFormationState(filing.state)
    ? (filing.state as StateCode)
    : 'FL';
  const stateRule = getFormationState(stateCode);
  // The annual-report self-service flow currently only ships for Florida
  // (because the Sunbiz lookup is FL-only). For non-FL filings we surface
  // the state's official portal link instead of the in-app flow.
  const showInAppAnnualReport = stateCode === 'FL';

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
    if (d.documentType === 'SUNBIZ_COVER_PAGE' || d.documentType === 'FILE_PACKAGE') return false;
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
    phone?: string;
    agentCountry?: string;
  } | null>(filing.registeredAgent, null);

  const nonUsRegisteredAgent =
    !!ra?.agentCountry && ra.agentCountry !== 'US' && ra.agentCountry !== '';
  const activeRa = filing.raServices.find(
    (svc) => svc.serviceProvider === 'INTERNAL' && svc.status !== 'CANCELLED',
  );
  const raUpsellPrice = formatRaRenewalPrice(activeRa?.renewalPriceCents);

  return (
    <div className="container max-w-5xl py-10 space-y-8">
      <Link
        href={hrefForLocale('/dashboard', locale)}
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
              {stateRule.name} {filing.entityType === 'LLC' ? 'Limited Liability Company' : 'Profit Corporation'}
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
          <Link href={hrefForLocale('/dashboard/documents', locale)}>
            <Download className="h-4 w-4" />
            {t('allDocuments')}
          </Link>
        </Button>
      </div>

      {/* Annual report action card - only for FL filings (in-app flow) */}
      {showInAppAnnualReport && (filing.status === 'APPROVED' || filing.filingSource === 'LINKED') && (() => {
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
                    <p>{t('arFiledDate')}: {filedReport.filedDate ? formatDate(filedReport.filedDate, undefined, locale) : '-'}</p>
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
                    <Link href={hrefForLocale(`/dashboard/filings/${filing.id}/annual-report`, locale)}>
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
                    <Link href={hrefForLocale(`/dashboard/filings/${filing.id}/annual-report`, locale)}>
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
                  <p className="text-sm text-ink-muted">{t('nonUsRaBody', { price: raUpsellPrice })}</p>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

      {/* For non-FL filings, surface the upcoming annual compliance window
          inside the dashboard. We keep customers on-site - when our managed
          annual filing add-on is ready for that state we'll handle it here. */}
      {!showInAppAnnualReport && filing.status === 'APPROVED' && (() => {
        const compliance = stateRule.annualCompliance.find(
          (c) => c.entityType === filing.entityType,
        );
        if (!compliance) return null;
        return (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-6 space-y-3">
              <h3 className="font-semibold text-ink">
                {stateRule.name} {compliance.label}
              </h3>
              <p className="text-sm text-ink-muted">{compliance.description}</p>
              <p className="text-xs text-ink-subtle">
                We&apos;ll remind you 60, 30, and 3 days before the deadline. Reply to any
                reminder if you&apos;d like our team to file it for you.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* EIN: offered once the company is approved; status card once ordered. */}
      {(() => {
        const einEntitled = filingIncludesEin({
          tier: filing.serviceTier as TierSlug,
          addOnSlugs: filingAddOnSlugs,
          createdAt: filing.createdAt,
        });
        if (canOrderEin({ status: filing.status, entitled: einEntitled })) {
          return (
            <Card className="border-primary/15">
              <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Hash className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-semibold text-ink">Get your EIN (federal tax ID)</h3>
                  <p className="text-sm text-ink-muted">
                    Most banks ask for an EIN to open a business account. We prepare and file IRS
                    Form SS-4 for {filing.businessName ?? 'your company'} and upload your EIN
                    confirmation letter here for {formatCurrency(ADD_ON_BY_SLUG.ein.serviceMarginCents)}.
                    Prefer to do it yourself? The IRS issues EINs free at irs.gov.
                  </p>
                </div>
                <Button asChild className="shrink-0">
                  <Link href={hrefForLocale(`/dashboard/filings/${filing.id}/ein`, locale)}>Get my EIN</Link>
                </Button>
              </CardContent>
            </Card>
          );
        }
        if (!einEntitled) return null;
        const ein = filing.einApplication;
        const status = ein?.status ?? 'needs_info';
        const headline =
          status === 'delivered'
            ? `EIN delivered${ein?.einNumberLast4 ? ` - ●●●●●${ein.einNumberLast4}` : ''}`
            : status === 'submitted'
              ? 'EIN submitted to the IRS - awaiting confirmation'
              : status === 'manual_foreign'
                ? 'EIN - manual processing in progress (foreign applicant)'
                : status === 'ready_online'
                  ? 'EIN - IRS online filing scheduled'
                  : 'EIN - responsible-party details required';
        const body =
          status === 'manual_foreign'
            ? 'Foreign applicants cannot use the IRS online EIN Assistant. We are preparing your SS-4 manually and will submit it by phone or fax. Typical turnaround is 4–6 business days.'
            : status === 'ready_online'
              ? "We'll file your SS-4 with the IRS online as soon as your formation is approved. You can expect your EIN letter in your dashboard within 1 business day."
              : status === 'submitted'
                ? "Your SS-4 is with the IRS. We'll upload your EIN confirmation letter (CP 575) to the dashboard as soon as it arrives."
                : status === 'delivered'
                  ? 'Your EIN confirmation letter is available in the documents section.'
                  : 'Add the responsible-party details so we can file Form SS-4 for you.';
        return (
          <Card className="border-primary/15">
            <CardContent className="p-6 space-y-2">
              <h3 className="font-semibold text-ink">{headline}</h3>
              <p className="text-sm text-ink-muted">{body}</p>
              {status === 'needs_info' && (
                <Button asChild size="sm">
                  <Link href={hrefForLocale(`/dashboard/filings/${filing.id}/ein`, locale)}>Add EIN details</Link>
                </Button>
              )}
              {ein?.responsiblePartyType === 'us' && ein.taxIdLast4 && (
                <p className="text-xs text-ink-subtle">
                  Tax ID on file: ●●●-●●-{ein.taxIdLast4}
                </p>
              )}
              {ein?.responsiblePartyType === 'foreign' && ein.passportLast4 && (
                <p className="text-xs text-ink-subtle">
                  Passport on file: ends in {ein.passportLast4} ({ein.passportCountry ?? '-'})
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {CERTIFICATE_ADDON_SLUGS.map((slug) => {
        const offer = certificateOffer({
          slug,
          status: filing.status,
          tier: filing.serviceTier,
          filingSource: filing.filingSource,
          addOnSlugs: filingAddOnSlugs,
          documents: filing.documents,
        });
        if (offer.kind === 'hidden') return null;
        const quote = certificateOrderQuote(
          slug,
          filingEntityType(filing.entityType),
          filingFormationState(filing.state),
        );
        const isCopy = slug === 'cert_copy';
        return (
          <CertificateAddonCard
            key={slug}
            href={certificateOrderPath(filing.id, slug)}
            locale={locale}
            icon={isCopy ? <FileCheck className="h-5 w-5" /> : <Award className="h-5 w-5" />}
            title={isCopy ? tCert('copyTitle') : tCert('statusTitle')}
            body={isCopy ? tCert('copyCardBody') : tCert('statusCardBody')}
            priceLabel={tCert('priceSplit', {
              service: formatCurrency(quote.serviceCents),
              stateFee: formatCurrency(quote.stateFeeCents),
              state: stateRule.name,
            })}
            cta={isCopy ? tCert('orderCtaCopy') : tCert('orderCtaStatus')}
            includedLabel={tCert('alreadyIncluded')}
            pendingNote={offer.kind === 'included' && offer.pending ? tCert('pendingNote') : null}
            orderable={offer.kind === 'orderable'}
          />
        );
      })}

      {/* BOI note. Anchor target for the checkout-success `#boi` link. */}
      <Card id="boi" className="scroll-mt-24">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
              <Landmark className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-ink">{t('boiTitle')}</h3>
              <p className="mt-1 text-sm text-ink-muted leading-relaxed">{t('boiBody')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status timeline */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-ink-subtle">
            {t('filingTimeline')}
          </h3>
          <div className="space-y-4">
            <TimelineEvent
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={t('timelineSubmitted', {
                state: stateRule.name,
                office: stateRule.code === 'DE' ? t('officeDivision') : t('officeSecretary'),
              })}
              detail={
                filing.sunbizSubmittedAt
                  ? formatDateLong(filing.sunbizSubmittedAt, locale)
                  : t('filingPending')
              }
              done={!!filing.sunbizSubmittedAt}
            />
            <TimelineEvent
              icon={<CheckCircle2 className="h-4 w-4" />}
              title={t('timelineApproved', { state: stateRule.name })}
              detail={
                filing.sunbizApprovedAt
                  ? formatDateLong(filing.sunbizApprovedAt, locale)
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
                  ? fillDueMessage(t.raw('dueDateOn'), filing.annualReports[0].dueDate, locale)
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
                          <p className="text-sm font-medium truncate">
                            {displayedCertificateTitle(doc.documentType, doc.title, documentTitles)}
                          </p>
                          <p className="text-xs text-amber-700">{tWizard('documentPendingState')}</p>
                        </div>
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          {t('filingPending')}
                        </Badge>
                      </div>
                    </li>
                  ) : (
                    <li key={doc.id}>
                      <a
                        href={`/api/documents/${doc.id}`}
                        download
                        className="flex items-center gap-3 px-2 py-3 hover:bg-muted/30 rounded-md transition-colors"
                      >
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {displayedCertificateTitle(doc.documentType, doc.title, documentTitles)}
                          </p>
                          <p className="text-xs text-ink-subtle">{formatDate(doc.generatedAt, undefined, locale)}</p>
                        </div>
                        <Download className="h-4 w-4 text-ink-subtle" />
                      </a>
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
                {ra.phone?.trim() ? (
                  <p className="text-sm text-ink-muted">{tWizard('phone')}: {ra.phone}</p>
                ) : null}
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
                <span className="font-mono">{correspondence?.email ?? '-'}</span>
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
                    <span>{formatDate(latest.completedAt ?? latest.createdAt, undefined, locale)}</span>
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

function CertificateAddonCard({
  href,
  locale,
  icon,
  title,
  body,
  priceLabel,
  cta,
  includedLabel,
  pendingNote,
  orderable,
}: {
  href: string;
  locale: 'en' | 'es';
  icon: React.ReactNode;
  title: string;
  body: string;
  priceLabel: string;
  cta: string;
  includedLabel: string;
  pendingNote: string | null;
  orderable: boolean;
}) {
  return (
    <Card className="border-primary/15">
      <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{orderable ? body : pendingNote ?? body}</p>
          {orderable ? (
            <p className="text-xs text-ink-subtle">{priceLabel}</p>
          ) : (
            <p className="text-xs font-medium text-ink">{includedLabel}</p>
          )}
        </div>
        {orderable ? (
          <Button asChild className="shrink-0">
            <Link href={hrefForLocale(href, locale)}>{cta}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
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
