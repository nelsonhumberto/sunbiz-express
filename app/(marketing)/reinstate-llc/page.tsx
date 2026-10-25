import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ReinstatementOrderForm } from '@/components/marketing/ReinstatementOrderForm';
import { REINSTATEMENT_SERVICE_FEE } from '@/lib/pricing';
import { pageTitle } from '@/lib/seo-title';
import { withLocaleMeta } from '@/lib/locale-seo';

const PATH = '/reinstate-llc';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations('reinstateLlc');
  return withLocaleMeta(
    PATH,
    {
      title: pageTitle(t('metaTitle')),
      description: t('metaDescription'),
      openGraph: {
        title: t('metaTitle'),
        description: t('metaDescription'),
        type: 'website',
      },
    },
    locale,
  );
}

export default async function ReinstateLlcPage() {
  const t = await getTranslations('reinstateLlc');
  return (
    <div className="bg-gradient-to-b from-primary/5 to-white">
      <section className="container max-w-3xl py-16 text-center space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{t('kicker')}</p>
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight text-ink">{t('title')}</h1>
        <p className="text-lg text-ink-muted max-w-2xl mx-auto">{t('intro')}</p>
        <p className="text-sm text-ink-muted max-w-2xl mx-auto">
          {t('feeNote', { fee: REINSTATEMENT_SERVICE_FEE })}
        </p>
      </section>

      <section className="container max-w-2xl pb-8">
        <div className="rounded-2xl border border-border bg-white p-5 text-sm text-ink-muted space-y-3">
          <p>{t('feeExplain')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('feeReinstatement')}</li>
            <li>{t('feeAnnual')}</li>
            <li>{t('feeLate')}</li>
          </ul>
          <p>
            {t('sourcesBefore')}{' '}
            <a className="underline" href="https://dos.fl.gov/sunbiz/forms/fees/llc-fees/" target="_blank" rel="noopener noreferrer">
              dos.fl.gov/sunbiz/forms/fees/llc-fees
            </a>
            {' · '}
            <a className="underline" href="https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/" target="_blank" rel="noopener noreferrer">
              dos.fl.gov/sunbiz/manage-business/efile/reinstatement
            </a>
          </p>
        </div>
      </section>

      <section className="container max-w-2xl pb-20">
        <ReinstatementOrderForm />
      </section>
    </div>
  );
}
