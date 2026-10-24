import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { GuestAnnualReportForm } from '@/components/marketing/GuestAnnualReportForm';
import { FL } from '@/lib/florida';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS } from '@/lib/pricing';
import { withBrand } from '@/lib/seo-title';
import { formatCurrency } from '@/lib/utils';
import { withLocaleMeta } from '@/lib/locale-seo';
import { CheckCircle2, X } from 'lucide-react';

const TITLE = 'File Your Florida Annual Report Online | Due May 1';
const DESCRIPTION =
  'File your Florida LLC or corporation annual report between Jan 1 and May 1. See the state fee, the $400 late fee, and how LaunchForma files it for you.';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('annualReportPage');
    return withLocaleMeta(
      '/file-annual-report',
      {
        title: t('metaTitle'),
        description: t('metaDescription'),
        openGraph: {
          title: t('metaTitle'),
          description: t('ogDescription'),
          type: 'website',
        },
      },
      locale,
    );
  }
  return withLocaleMeta(
    '/file-annual-report',
    {
      title: TITLE,
      description: DESCRIPTION,
      openGraph: {
        title: withBrand(TITLE),
        description: DESCRIPTION,
        type: 'website',
      },
    },
    locale,
  );
}

const OUR_SERVICE_FEE = ANNUAL_REPORT_SERVICE_FEE_CENTS;
const LLC_TOTAL = OUR_SERVICE_FEE + FL.fees.annualReportLLC; // $80 + $138.75 = $218.75
const CORP_TOTAL = OUR_SERVICE_FEE + FL.fees.annualReportCorp; // $80 + $150 = $230

const competitors = [
  {
    name: 'LegalZoom',
    serviceFee: 9_900,
    llcTotal: 9_900 + FL.fees.annualReportLLC,
    corpTotal: 9_900 + FL.fees.annualReportCorp,
    highlight: false,
  },
  {
    name: 'FilingServices.com',
    serviceFee: 14_900,
    llcTotal: 14_900 + FL.fees.annualReportLLC,
    corpTotal: 14_900 + FL.fees.annualReportCorp,
    highlight: false,
  },
  {
    name: 'LaunchForma',
    serviceFee: OUR_SERVICE_FEE,
    llcTotal: LLC_TOTAL,
    corpTotal: CORP_TOTAL,
    highlight: true,
  },
];

export default async function FileAnnualReportPage() {
  const locale = await getLocale();
  const t = locale === 'es' ? await getTranslations('annualReportPage') : null;
  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/5 to-white">
      {/* Hero */}
      <section className="container max-w-4xl py-16 text-center space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {t ? t('kicker') : 'Florida Annual Report Filing'}
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight text-ink">
          {t ? t('title') : (
            <>
              File your Florida annual report<br className="hidden md:block" /> in minutes
            </>
          )}
        </h1>
        <p className="text-lg text-ink-muted max-w-xl mx-auto">
          {t ? (
            <>
              {t('introBefore')} <strong>{t('introStrong')}</strong>
              {t('introAfter')}
            </>
          ) : (
            <>
              Avoid the <strong>$400 non-waivable late penalty</strong>. We file directly with the
              Florida Division of Corporations - no account required.
            </>
          )}
        </p>
        <div className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2 rounded-full text-sm font-semibold">
          {t
            ? `${t('llcBadge', { price: formatCurrency(LLC_TOTAL) })} \u00a0·\u00a0 ${t('corpBadge', { price: formatCurrency(CORP_TOTAL) })}`
            : <>LLC: {formatCurrency(LLC_TOTAL)} all-in &nbsp;·&nbsp; Corp: {formatCurrency(CORP_TOTAL)} all-in</>}
        </div>
      </section>

      {/* Price comparison */}
      <section className="container max-w-3xl pb-12">
        <h2 className="text-center font-display text-2xl font-medium mb-6">
          {t ? t('compare') : 'How we compare'}
        </h2>
        <div className="rounded-2xl overflow-hidden border border-border shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-5 py-3 font-semibold text-ink">{t ? t('colCompany') : 'Company'}</th>
                <th className="text-right px-5 py-3 font-semibold text-ink">{t ? t('colService') : 'Service fee'}</th>
                <th className="text-right px-5 py-3 font-semibold text-ink">{t ? t('colLlc') : 'LLC total'}</th>
                <th className="text-right px-5 py-3 font-semibold text-ink">{t ? t('colCorp') : 'Corp total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {competitors.map((c) => (
                <tr
                  key={c.name}
                  className={c.highlight ? 'bg-primary/5 font-semibold' : 'bg-white'}
                >
                  <td className="px-5 py-3">
                    {c.highlight ? (
                      <span className="flex items-center gap-2 text-primary">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        {c.name}
                        <span className="ml-1 text-xs bg-primary text-white px-2 py-0.5 rounded-full font-semibold">
                          {t ? t('bestPrice') : 'Best price'}
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-ink-muted">
                        <X className="h-4 w-4 shrink-0 text-red-400" />
                        {c.name}
                      </span>
                    )}
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums ${c.highlight ? 'text-primary' : 'text-ink-muted'}`}>
                    {formatCurrency(c.serviceFee)}
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums ${c.highlight ? 'text-primary' : 'text-ink-muted'}`}>
                    {formatCurrency(c.llcTotal)}
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums ${c.highlight ? 'text-primary' : 'text-ink-muted'}`}>
                    {formatCurrency(c.corpTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td colSpan={4} className="px-5 py-2 text-xs text-ink-subtle">
                  {t
                    ? t('footnote')
                    : '* All totals include the Florida state filing fee ($138.75 LLC · $150.00 Corp). Competitor prices as of 2026.'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* The form */}
      <section className="container max-w-2xl pb-20">
        <div className="mb-8 text-center space-y-2">
          <h2 className="font-display text-2xl font-medium">{t ? t('formTitle') : 'Start your filing'}</h2>
          <p className="text-sm text-ink-muted">
            {t ? t('formBody') : 'Enter your Florida document number to get started. No account needed.'}
          </p>
        </div>
        <GuestAnnualReportForm />
      </section>
    </main>
  );
}
