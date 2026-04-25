import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarClock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDateLong, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const reports = await prisma.annualReport.findMany({
    where: { filing: { userId: session.user.id } },
    include: { filing: true },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
  });

  const now = Date.now();
  const upcoming = reports.filter((r) => r.status === 'PENDING');
  const filed = reports.filter((r) => r.status === 'FILED');

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Compliance Calendar</h1>
        <p className="mt-2 text-ink-muted">
          Florida requires annual reports between January 1 and May 1 each year. Miss the deadline
          and the state charges a non-waivable $400 late fee.
        </p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <CalendarClock className="h-10 w-10 mx-auto text-ink-subtle mb-3" />
            <p className="text-ink-muted">
              Compliance deadlines appear here once you have an approved filing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Upcoming
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
                              href={`/dashboard/filings/${report.filingId}`}
                              className="font-semibold text-ink hover:text-primary"
                            >
                              {report.filing.businessName}
                            </Link>
                            <Badge variant={overdue ? 'danger' : urgent ? 'warn' : 'secondary'}>
                              {overdue
                                ? `${Math.abs(daysUntil)} days overdue`
                                : `${daysUntil} days`}
                            </Badge>
                          </div>
                          <p className="text-sm text-ink-muted mt-1">
                            {report.reportYear} Annual Report ·{' '}
                            <strong>Due {formatDateLong(report.dueDate)}</strong>
                          </p>
                          <p className="text-xs text-ink-subtle mt-1">
                            State fee: {formatCurrency(report.filingFeeCents)} ·{' '}
                            {overdue ? `+ $400 late fee applies` : 'On-time filing avoids $400 late fee'}
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
                Filed
              </h2>
              <div className="space-y-2">
                {filed.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-success-subtle/40 border border-success/20"
                  >
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium">{report.filing.businessName}</span>
                    <span className="text-xs text-ink-muted ml-auto">
                      {report.reportYear} · Filed {formatDateLong(report.filedDate ?? report.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Tips card */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold text-ink mb-3">📅 Florida compliance basics</h3>
          <ul className="space-y-2 text-sm text-ink-muted">
            <li>· Annual reports due between January 1 and May 1 each year (11:59 PM ET)</li>
            <li>· LLC fee: $138.75 · Corporation fee: $150.00</li>
            <li>
              · <strong className="text-ink">$400 late fee is non-waivable</strong> — there is no
              hardship exception
            </li>
            <li>
              · Failure to file by the third Friday in September results in administrative
              dissolution
            </li>
            <li>· Reinstatement costs $100 (LLC) or $600 (Corp) plus all back fees</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
