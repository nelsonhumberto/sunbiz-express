import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  CheckCircle2,
  FileText,
  ArrowRight,
  Mail,
  Clock,
  ShieldCheck,
  Landmark,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { getFormationState } from '@/lib/formation-states';
import { CheckoutConversionTracker } from '@/components/analytics/CheckoutConversionTracker';
import { retrieveCheckoutSession } from '@/lib/retrieve-checkout-session';
import {
  checkoutFilingCandidates,
  gateCheckoutSuccess,
  readQueryParam,
} from '@/lib/checkout-session-verification';
import {
  filingShowsOperatingAgreement,
  visibleSuccessDocuments,
} from '@/lib/success-documents';
import type { AddOnSlug, TierSlug } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { filing?: string | string[]; session_id?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const t = await getTranslations('checkoutSuccess');
  const sessionId = readQueryParam(searchParams.session_id);
  const urlFilingId = readQueryParam(searchParams.filing);

  if (!sessionId) {
    return (
      <OrderNotice
        pending
        title={t('confirmingTitle')}
        body={t('confirmingBody')}
        dashboardLabel={t('goDashboard')}
      />
    );
  }

  const checkoutSession = await retrieveCheckoutSession(sessionId);
  const candidateIds = checkoutFilingCandidates(checkoutSession, urlFilingId);
  const [user, filings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, stripeCustomerId: true },
    }),
    candidateIds.length
      ? prisma.filing.findMany({
          where: { id: { in: candidateIds }, userId: session.user.id },
          include: {
            documents: true,
            filingAdditionalServices: {
              include: { service: { select: { serviceSlug: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const gate = gateCheckoutSuccess({
    sessionId,
    session: checkoutSession,
    owner: {
      userId: session.user.id,
      email: user?.email ?? session.user.email,
      stripeCustomerId: user?.stripeCustomerId,
      requestedFilingId: urlFilingId,
      ownedFilingIds: filings.map((row) => row.id),
    },
  });

  if (gate.status !== 'paid') {
    return (
      <OrderNotice
        pending
        title={t('confirmingTitle')}
        body={t('confirmingBody')}
        dashboardLabel={t('goDashboard')}
      />
    );
  }

  const filing = gate.filingId ? filings.find((row) => row.id === gate.filingId) ?? null : null;
  const tracker = (
    <CheckoutConversionTracker
      userId={session.user.id}
      filingId={filing?.id ?? gate.filingId}
      amountCents={gate.amountCents}
      currency={gate.currency}
      state={filing?.state}
      entityType={filing?.entityType}
      tier={filing?.serviceTier}
      utm={
        filing
          ? {
              utmSource: filing.utmSource,
              utmMedium: filing.utmMedium,
              utmCampaign: filing.utmCampaign,
              utmContent: filing.utmContent,
              utmTerm: filing.utmTerm,
              gclid: filing.gclid,
              liFatId: filing.liFatId,
            }
          : undefined
      }
    />
  );

  if (!filing) {
    return (
      <>
        {tracker}
        <OrderNotice
          title={t('confirmedTitle')}
          body={t('confirmedBody')}
          dashboardLabel={t('goDashboard')}
        />
      </>
    );
  }

  const tDocs = await getTranslations('documentTypes');
  const showOperatingAgreement = filingShowsOperatingAgreement({
    entityType: filing.entityType,
    tier: filing.serviceTier as TierSlug,
    addOnSlugs: filing.filingAdditionalServices.map(
      (row) => row.service.serviceSlug as AddOnSlug,
    ),
  });
  const downloads = visibleSuccessDocuments(filing.documents, showOperatingAgreement);

  const stateRule = getFormationState(filing.state);
  const stateName = stateRule.name;
  const entityLabel =
    filing.entityType === 'LLC'
      ? `${stateName} ${stateRule.documentLabels.llcArticles}`
      : `${stateName} ${stateRule.documentLabels.corpArticles}`;

  return (
    <div className="min-h-screen bg-surface">
      {tracker}
      {/* Confetti-ish hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 mesh-bg" />
        <div className="aurora" />
        <div className="container relative py-16 md:py-24 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-success-subtle border-2 border-success/30 mb-6">
            <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight text-balance">
            {t('headline1')}{' '}
            <span className="italic text-primary">{t('headline2', { state: stateName })}</span>
            {t('headline3')}.
          </h1>
          <p className="mt-3 text-lg text-ink-muted max-w-xl mx-auto">
            {t.rich('subhead', {
              name: filing.businessName ?? '',
              state: stateName,
              strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
            })}
          </p>

          {/* Filing details */}
          <div className="mt-10 max-w-2xl mx-auto rounded-2xl border border-border bg-white p-6 md:p-8 text-left shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
              {t('filingReceipt')}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label={t('businessName')} value={filing.businessName ?? '-'} />
              <DetailRow label={t('entityType')} value={entityLabel} />
              <DetailRow label={t('trackingNumber')} value={filing.sunbizTrackingNumber ?? '-'} mono />
              <DetailRow label={t('pin')} value={filing.sunbizPin ?? '-'} mono />
              {filing.sunbizFilingNumber ? (
                <DetailRow label={t('filingNumber')} value={filing.sunbizFilingNumber} mono />
              ) : null}
              <DetailRow
                label={t('totalPaid')}
                value={formatCurrency(filing.totalCents, { showZero: true })}
              />
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href={`/dashboard/filings/${filing.id}`}>
                {t('viewDetails')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">{t('goDashboard')}</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* What happens next */}
      <div className="container max-w-3xl py-12">
        <h2 className="font-display text-2xl font-medium text-center mb-8">
          {t('whatHappensNext')}
        </h2>
        <div className="space-y-3">
          <NextStep
            icon={<Mail className="h-5 w-5 text-primary" />}
            title={t('checkEmail')}
            body={t('checkEmailBody', { email: session.user.email ?? '' })}
            timing={t('now')}
          />
          <NextStep
            icon={<ShieldCheck className="h-5 w-5 text-primary" />}
            title={t('stateProcesses', { state: stateName })}
            body={t('stateProcessesBody', { state: stateName })}
            timing={t('stateProcessesTime')}
          />
          <NextStep
            icon={<FileText className="h-5 w-5 text-primary" />}
            title={t('documentsReady')}
            body={
              showOperatingAgreement
                ? t('documentsReadyBodyWithAgreement')
                : t('documentsReadyBody')
            }
            timing={t('availableNow')}
            footer={
              downloads.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {downloads.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/api/documents/${doc.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {SUCCESS_DOCUMENT_LABELS.has(doc.documentType)
                          ? tDocs(doc.documentType as 'RECEIPT')
                          : doc.documentType}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null
            }
          />
          <NextStep
            icon={<Landmark className="h-5 w-5 text-primary" />}
            title={t('bankTitle')}
            body={t('bankBody')}
            timing={t('bankTime')}
          />
          <NextStep
            icon={<Clock className="h-5 w-5 text-warn" />}
            title={t('annualReminders')}
            body={t('annualRemindersBody')}
            timing={t('yearly')}
            footer={
              <span className="inline-flex items-center gap-1.5 text-xs text-success bg-success-subtle px-2 py-1 rounded-md mt-2">
                <CheckCircle2 className="h-3 w-3" />
                {t('annualReminderOnByDefault')}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}

const SUCCESS_DOCUMENT_LABELS = new Set([
  'ARTICLES_ORG',
  'ARTICLES_INC',
  'OPERATING_AGREEMENT',
  'CERT_STATUS',
  'CERT_COPY',
  'RECEIPT',
]);

function OrderNotice({
  title,
  body,
  dashboardLabel,
  pending,
}: {
  title: string;
  body: string;
  dashboardLabel: string;
  pending?: boolean;
}) {
  return (
    <div className="min-h-screen bg-surface">
      <div className="container py-16 md:py-24">
        <div className="max-w-xl mx-auto rounded-2xl border border-border bg-white p-8 md:p-10 text-center shadow-card">
          <div
            className={
              pending
                ? 'inline-flex h-16 w-16 items-center justify-center rounded-full bg-warn-subtle border border-warn/30 mb-6'
                : 'inline-flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle border-2 border-success/30 mb-6'
            }
          >
            {pending ? (
              <Clock className="h-8 w-8 text-warn" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={2.5} />
            )}
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-balance">
            {title}
          </h1>
          <p className="mt-3 text-lg text-ink-muted">{body}</p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/dashboard">{dashboardLabel}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-ink-subtle uppercase tracking-wider">{label}</p>
      <p className={mono ? 'font-mono text-sm text-ink' : 'text-sm text-ink font-medium'}>{value}</p>
    </div>
  );
}

function NextStep({
  icon,
  title,
  body,
  timing,
  ctaLabel,
  ctaHref,
  footer,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  timing: string;
  ctaLabel?: string;
  ctaHref?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-white p-5">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="font-semibold text-ink">{title}</p>
          <span className="text-xs text-ink-subtle">{timing}</span>
        </div>
        <p className="text-sm text-ink-muted mt-1 leading-relaxed">{body}</p>
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline mt-2"
          >
            {ctaLabel}
          </Link>
        )}
        {footer}
      </div>
    </div>
  );
}
