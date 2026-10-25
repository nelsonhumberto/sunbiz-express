import Link from 'next/link';
import { CalendarClock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { hrefForLocale } from '@/lib/app-href';
import { redirectLocalized } from '@/lib/locale-redirect';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, cn } from '@/lib/utils';
import { formatDueLabel, formatLongDate } from '@/lib/due-label';

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user?.id) return await redirectLocalized('/sign-in');
  const t = await getTranslations('dashboard');
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';

  const reports = await prisma.annualReport.findMany({
    where: { filing: { userId: session.user.id } },
    include: { filing: true },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
  });

  const now = Date.now();
  const upcoming = reports.filter((r) => r.status === 'PENDING');
  const filed = reports.filter((r) => r.status === 'FILED');

  return (
    <div className="container max-w-4xl min-w-0 py-10 space-y-8">
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-medium tracking-tight break-words">{t('complianceTitle')}</h1>
        <p className="mt-2 text-ink-muted">{t('complianceSubtitle')}</p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <CalendarClock className="h-10 w-10 mx-auto text-ink-subtle mb-3" />
            <p className="text-ink-muted">{t('complianceEmpty')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {t('upcoming')}
              </h2>
              <div className="space-y-3">
                {upcoming.map((report) => {
                  const daysUntil = Math.ceil(
                    (report.dueDate.getTime() - now) / (1000 * 60 * 60 * 24)
                  );
                  const urgent = daysUntil < 30;
                  const overdue = daysUntil < 0;
                  return (
                    <Card key={report.id} className={cn(urgent && 'border-warn/40', overdue && 'border-destructive/40')}>
                      <CardContent className="p-5 flex items-start gap-4">
                        <div
                          className={cn(
                            'h-12 w-12 rounded-xl flex items-center justify-center shrink-0',
                            overdue
                              ? 'bg-destructive/10 text-destructive'
                              : urgent
                                ? 'bg-warn-subtle text-warn'
                                : 'bg-primary/10 text-primary'
                          )}
                        >
                          {overdue ? (
                            <AlertTriangle className="h-5 w-5" />
                          ) : (
                            <CalendarClock className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <Link
                              href={hrefForLocale(`/dashboard/filings/${report.filingId}`, locale)}
                              className="font-semibold text-ink hover:text-primary"
                            >
                              {report.filing.businessName}
                            </Link>
                            <Badge variant={overdue ? 'danger' : urgent ? 'warn' : 'secondary'}>
                              {overdue
                                ? t('daysOverdue', { days: Math.abs(daysUntil) })
                                : t('daysRemaining', { days: daysUntil })}
                            </Badge>
                          </div>
                          <p className="text-sm text-ink-muted mt-1">
                            {t('complianceAnnual', { year: report.reportYear })} ·{' '}
                            <strong>{formatDueLabel(t('due'), report.dueDate, locale)}</strong>
                          </p>
                          <p className="text-xs text-ink-subtle mt-1">
                            {t('stateFee')}: {formatCurrency(report.filingFeeCents)} ·{' '}
                            {overdue ? t('lateFeeApplies') : t('onTime')}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-ink-subtle shrink-0 mt-1" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {filed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {t('filed')}
              </h2>
              <div className="space-y-2">
                {filed.map((report) => (
                  <div
                    key={report.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-lg bg-success-subtle/40 border border-success/20 min-w-0"
                  >
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <span className="text-sm font-medium min-w-0">{report.filing.businessName}</span>
                    <span className="text-xs text-ink-muted sm:ml-auto">
                      {report.reportYear} ·{' '}
                      {t('complianceFiledOn', {
                        date: formatLongDate(report.filedDate ?? report.createdAt, locale),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-ink mb-3">{t('complianceTipsTitle')}</h3>
          <ul className="space-y-2 text-sm text-ink-muted">
            <li>· {t('complianceTip1')}</li>
            <li>· {t('complianceTip2')}</li>
            <li>· {t('complianceTip3')}</li>
            <li>· {t('complianceTip4')}</li>
            <li>· {t('complianceTip5')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
