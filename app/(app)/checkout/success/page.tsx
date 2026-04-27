import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  CheckCircle2,
  FileText,
  ArrowRight,
  Sparkles,
  Mail,
  Clock,
  ShieldCheck,
  Landmark,
  AlertTriangle,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: { filing?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  if (!searchParams.filing) redirect('/dashboard');

  const filing = await prisma.filing.findUnique({
    where: { id: searchParams.filing },
    include: { documents: true },
  });
  if (!filing || filing.userId !== session.user.id) redirect('/dashboard');

  const t = await getTranslations('checkoutSuccess');
  const tDocs = await getTranslations('documentTypes');

  return (
    <div className="min-h-screen bg-surface">
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
            <span className="italic text-primary">{t('headline2')}</span>
            {t('headline3')}.
          </h1>
          <p className="mt-3 text-lg text-ink-muted max-w-xl mx-auto">
            {t.rich('subhead', {
              name: filing.businessName ?? '',
              strong: (chunks) => <strong className="text-ink">{chunks}</strong>,
            })}
          </p>

          {/* Filing details */}
          <div className="mt-10 max-w-2xl mx-auto rounded-2xl border border-border bg-white p-6 md:p-8 text-left shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-3">
              {t('filingReceipt')}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DetailRow label={t('businessName')} value={filing.businessName ?? '—'} />
              <DetailRow
                label={t('entityType')}
                value={filing.entityType === 'LLC' ? tDocs('floridaLLCFull') : tDocs('floridaCorpFull')}
              />
              <DetailRow label={t('trackingNumber')} value={filing.sunbizTrackingNumber ?? '—'} mono />
              <DetailRow label={t('pin')} value={filing.sunbizPin ?? '—'} mono />
              <DetailRow label={t('filingNumber')} value={filing.sunbizFilingNumber ?? '—'} mono />
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
            title={t('stateProcesses')}
            body={t('stateProcessesBody')}
            timing={t('stateProcessesTime')}
          />
          <NextStep
            icon={<FileText className="h-5 w-5 text-primary" />}
            title={t('documentsReady')}
            body={t('documentsReadyBody')}
            timing={t('availableNow')}
          />
          {/* Federal compliance — almost every new entity owes BOI to FinCEN.
              Highlight the deadline so customers don't get hit with the
              $591/day fine for missing it. */}
          <NextStep
            icon={<AlertTriangle className="h-5 w-5 text-warn" />}
            title={t('boiTitle')}
            body={t('boiBody')}
            timing={t('boiTime')}
            ctaLabel={t('boiCta')}
            ctaHref="https://www.fincen.gov/boi"
          />
          <NextStep
            icon={<Landmark className="h-5 w-5 text-primary" />}
            title={t('bankTitle')}
            body={t('bankBody')}
            timing={t('bankTime')}
          />
          <NextStep
            icon={<Sparkles className="h-5 w-5 text-accent" />}
            title={t('openBank')}
            body={t('openBankBody')}
            timing={t('whenApproved')}
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
          <a
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline mt-2"
          >
            {ctaLabel}
          </a>
        )}
        {footer}
      </div>
    </div>
  );
}
