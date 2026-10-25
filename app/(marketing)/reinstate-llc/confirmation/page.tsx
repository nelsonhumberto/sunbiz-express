import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { pageTitle } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';
import { parseReinstatementSnapshot } from '@/lib/reinstatement-quote';
import { formatCurrency } from '@/lib/utils';
import { localizedHref } from '@/lib/locale-paths';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations('reinstateLlc');
  return withLocaleMeta(
    '/reinstate-llc/confirmation',
    {
      title: pageTitle(t('confirmMetaTitle')),
      description: t('confirmMetaDescription'),
      robots: { index: false, follow: false },
    },
    locale,
  );
}

export default async function ReinstatementConfirmationPage({
  searchParams,
}: {
  searchParams?: { order?: string };
}) {
  const locale = await getLocale();
  const t = await getTranslations('reinstateLlc');
  const orderId = searchParams?.order?.trim() ?? '';
  const filing = orderId
    ? await prisma.filing.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          filingSource: true,
          businessName: true,
          optionalDetails: true,
          payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
        },
      })
    : null;
  const snap = filing?.filingSource === 'REINSTATEMENT' && filing.payments.length > 0
    ? parseReinstatementSnapshot(filing.optionalDetails)
    : null;

  if (!filing || filing.filingSource !== 'REINSTATEMENT' || filing.payments.length === 0 || !snap) {
    return (
      <div className="container max-w-xl py-20 text-center space-y-4">
        <h1 className="font-display text-3xl font-medium">{t('confirmMissingTitle')}</h1>
        <p className="text-ink-muted">{t('confirmMissingBody')}</p>
        <Link href={localizedHref('/reinstate-llc', locale)} className="text-primary underline">
          {t('backToOrder')}
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-xl py-20 space-y-6">
      <div className="text-center space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t('kicker')}</p>
        <h1 className="font-display text-3xl md:text-4xl font-medium">{t('confirmTitle')}</h1>
        <p className="text-ink-muted">{t('confirmBody', { company: snap.companyName })}</p>
      </div>
      <div className="rounded-2xl border border-border bg-white p-6 text-sm space-y-2">
        <p><span className="text-ink-muted">{t('companyName')}:</span> {snap.companyName}</p>
        <p><span className="text-ink-muted">{t('docLabel')}:</span> <span className="font-mono">{snap.documentNumber}</span></p>
        <p><span className="text-ink-muted">{t('yearsLabel')}:</span> {snap.years.join(', ')}</p>
        <p><span className="text-ink-muted">{t('total')}:</span> {formatCurrency(snap.totalCents)}</p>
      </div>
      <p className="text-sm text-ink-muted">{t('confirmNext')}</p>
    </div>
  );
}
