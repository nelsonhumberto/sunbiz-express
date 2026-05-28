import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  Receipt,
  ShieldCheck,
  CalendarClock,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing' };

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const t = await getTranslations('dashboard');

  const [user, payments, raServices] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true },
    }),
    prisma.payment.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        filing: { select: { businessName: true, id: true } },
      },
    }),
    prisma.registeredAgentService.findMany({
      where: { filing: { userId: session.user.id }, status: 'ACTIVE' },
      orderBy: { renewalDate: 'asc' },
      include: { filing: { select: { businessName: true, state: true, id: true } } },
    }),
  ]);

  const hasStripe = !!user?.stripeCustomerId;
  const lifetimeCents = payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          {t('billingPageTitle')}
        </h1>
        <p className="mt-2 text-ink-muted">{t('billingPageSubtitle')}</p>
      </div>

      {/* Stripe portal pointer */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-ink">{t('cardOnFileTitle')}</h2>
            <p className="text-sm text-ink-muted">
              {hasStripe
                ? t('cardOnFileWithStripe')
                : t('cardOnFileNoStripe')}
            </p>
          </div>
          {hasStripe ? (
            <form action="/api/stripe/customer-portal" method="POST">
              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-md font-semibold hover:bg-primary-hover transition-colors"
              >
                {t('manageBillingButton')}
                <ExternalLink className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 border border-border bg-white text-ink px-5 py-2.5 rounded-md font-semibold hover:bg-muted transition-colors"
            >
              {t('startFirstFiling')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Lifetime + RA renewals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              <Receipt className="h-3.5 w-3.5" />
              {t('lifetimeSpend')}
            </div>
            <p className="font-display text-3xl font-medium">
              {formatCurrency(lifetimeCents)}
            </p>
            <p className="text-xs text-ink-subtle">
              {t('lifetimeFootnote', {
                count: payments.filter((p) => p.status === 'SUCCEEDED').length,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('activeSubscriptions')}
            </div>
            {raServices.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('noActiveSubscriptions')}</p>
            ) : (
              <ul className="text-sm space-y-1.5">
                {raServices.map((svc) => (
                  <li key={svc.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      <span className="text-ink-muted text-xs mr-2 uppercase tracking-wider">
                        {svc.filing.state ?? 'FL'} RA
                      </span>
                      <Link
                        href={`/dashboard/filings/${svc.filingId}`}
                        className="font-medium hover:text-primary"
                      >
                        {svc.filing.businessName ?? '—'}
                      </Link>
                    </span>
                    <span className="text-xs text-ink-subtle whitespace-nowrap inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {t('renewsOn')} {formatDate(svc.renewalDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment history */}
      <Card>
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-ink">{t('paymentHistoryTitle')}</h2>
            <p className="text-sm text-ink-muted">{t('paymentHistorySubtitle')}</p>
          </div>
          {payments.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-ink-muted">
              {t('noPaymentsYet')}{' '}
              <Link href="/pricing" className="text-primary hover:underline font-medium">
                {t('seePricing')}
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/filings/${payment.filingId}`}
                      className="font-medium text-ink hover:text-primary truncate"
                    >
                      {payment.filing.businessName ?? '—'}
                    </Link>
                    <p className="text-xs text-ink-subtle">
                      {payment.cardBrand && payment.cardLast4 ? (
                        <>
                          {payment.cardBrand} ending {payment.cardLast4} ·{' '}
                        </>
                      ) : null}
                      {formatDate(payment.completedAt ?? payment.createdAt)}
                      {payment.couponCode && <> · coupon {payment.couponCode}</>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium tabular-nums">
                      {formatCurrency(payment.amountCents)}
                    </p>
                    <PaymentStatusBadge status={payment.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-ink-subtle">
        {t('billingDisputeNote')}{' '}
        <a
          href="mailto:billing@launchforma.com"
          className="text-primary hover:underline font-medium"
        >
          billing@launchforma.com
        </a>
        .
      </p>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'SUCCEEDED') {
    return (
      <Badge variant="success" size="sm">
        Paid
      </Badge>
    );
  }
  if (status === 'REFUNDED') {
    return (
      <Badge variant="warn" size="sm">
        Refunded
      </Badge>
    );
  }
  if (status === 'FAILED') {
    return (
      <Badge variant="warn" size="sm">
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" size="sm">
      {status}
    </Badge>
  );
}
