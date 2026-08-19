import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  RenewRegisteredAgentForm,
  type RaSavedCard,
} from '@/components/dashboard/RenewRegisteredAgentForm';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

/** Advance a date by exactly one year (mirrors the server action). */
function plusOneYear(date: Date): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

export default async function RegisteredAgentRenewalPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const t = await getTranslations('dashboard');

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      raServices: {
        where: { serviceProvider: 'INTERNAL', status: { not: 'CANCELLED' } },
        orderBy: { renewalDate: 'asc' },
        take: 1,
      },
      payments: {
        where: { status: 'SUCCEEDED' },
        orderBy: { completedAt: 'desc' },
        take: 1,
        select: {
          cardLast4: true,
          cardBrand: true,
          cardholderName: true,
          stripePaymentMethodId: true,
        },
      },
    },
  });

  if (!filing || filing.userId !== session.user.id) notFound();

  const svc = filing.raServices[0];
  // Nothing to renew (customer is their own agent, or service cancelled).
  if (!svc) redirect(`/dashboard/filings/${params.id}`);

  const agentAddress = [
    svc.street1,
    svc.street2,
    `${svc.city}, ${svc.state} ${svc.zip}`,
  ]
    .filter(Boolean)
    .join(', ');

  // Only offer the saved card when we actually have a reusable payment method
  // attached to the Stripe Customer. Cards taken before setup_future_usage
  // shipped have a last4 on the Payment row but no attached PM, so reuse would
  // fail - those customers just see the new-card form.
  const lastPayment = filing.payments[0];
  const savedCard: RaSavedCard | null =
    lastPayment?.cardLast4 && lastPayment?.stripePaymentMethodId
      ? {
          last4: lastPayment.cardLast4,
          brand: lastPayment.cardBrand ?? 'Card',
          cardholderName: lastPayment.cardholderName ?? '',
          paymentMethodId: lastPayment.stripePaymentMethodId,
        }
      : null;

  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <Link
        href={`/dashboard/filings/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('raRenewBack')}
      </Link>

      <div>
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium mb-1">
          {svc.state} Registered Agent
        </p>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {t('raRenewTitle')}
        </h1>
        <p className="text-sm text-ink-muted mt-2">{t('raRenewIntro')}</p>
      </div>

      <RenewRegisteredAgentForm
        raServiceId={svc.id}
        companyName={filing.businessName ?? ''}
        agentAddress={agentAddress}
        currentRenewalDate={svc.renewalDate.toISOString()}
        newRenewalDate={plusOneYear(svc.renewalDate).toISOString()}
        renewalPriceCents={svc.renewalPriceCents}
        savedCard={savedCard}
      />
    </div>
  );
}
