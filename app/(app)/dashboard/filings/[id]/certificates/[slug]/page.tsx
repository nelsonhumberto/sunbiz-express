import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import {
  CertificateOrderForm,
  type CertificateSavedCard,
} from '@/components/dashboard/CertificateOrderForm';
import {
  certificateOffer,
  certificateOrderQuote,
  filingEntityType,
  filingFormationState,
  isCertificateAddOnSlug,
} from '@/lib/certificate-addons';
import { getFormationState } from '@/lib/formation-states';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string; slug: string };
}

export default async function CertificateOrderPage({ params }: PageProps) {
  if (!isCertificateAddOnSlug(params.slug)) notFound();
  const slug = params.slug;

  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const t = await getTranslations('certificates');

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      filingAdditionalServices: { include: { service: true } },
      documents: { select: { documentType: true, pendingState: true } },
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

  const offer = certificateOffer({
    slug,
    status: filing.status,
    tier: filing.serviceTier,
    filingSource: filing.filingSource,
    addOnSlugs: filing.filingAdditionalServices.map((row) => row.service.serviceSlug),
    documents: filing.documents,
  });
  if (offer.kind === 'hidden') redirect(`/dashboard/filings/${filing.id}`);

  const entityType = filingEntityType(filing.entityType);
  const state = filingFormationState(filing.state);
  const quote = certificateOrderQuote(slug, entityType, state);
  const stateRule = getFormationState(state);
  const company = filing.businessName ?? '';
  const isCopy = slug === 'cert_copy';

  const last = filing.payments[0];
  const savedCard: CertificateSavedCard | null =
    offer.kind === 'orderable' && last?.cardLast4 && last.stripePaymentMethodId
      ? {
          last4: last.cardLast4,
          brand: last.cardBrand ?? 'Card',
          cardholderName: last.cardholderName ?? '',
          paymentMethodId: last.stripePaymentMethodId,
        }
      : null;

  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <Link
        href={`/dashboard/filings/${filing.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <div>
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium mb-1">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          {isCopy ? t('copyTitle') : t('statusTitle')}
        </h1>
        <p className="text-sm text-ink-muted mt-2">
          {isCopy ? t('copyIntro', { company }) : t('statusIntro', { company })}
        </p>
      </div>

      {offer.kind === 'included' ? (
        <Card>
          <CardContent className="p-6 space-y-2">
            <p className="font-semibold text-ink">{t('alreadyIncluded')}</p>
            <p className="text-sm text-ink-muted">
              {offer.pending ? t('pendingNote') : t('alreadyIncludedBody')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <CertificateOrderForm
          filingId={filing.id}
          slug={slug}
          companyName={company}
          stateName={stateRule.name}
          tier={filing.serviceTier}
          state={state}
          entityType={entityType}
          serviceCents={quote.serviceCents}
          stateFeeCents={quote.stateFeeCents}
          totalCents={quote.totalCents}
          savedCard={savedCard}
        />
      )}
    </div>
  );
}
