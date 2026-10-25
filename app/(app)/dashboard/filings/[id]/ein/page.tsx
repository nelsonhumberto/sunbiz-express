import Link from 'next/link';
import { notFound } from 'next/navigation';
import { redirectLocalized } from '@/lib/locale-redirect';
import { ArrowLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { hrefForLocale } from '@/lib/app-href';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { ADD_ON_BY_SLUG, type AddOnSlug, type TierSlug } from '@/lib/pricing';
import { canOrderEin, filingIncludesEin } from '@/lib/ein';
import { EinOrderForm, type EinSavedCard } from '@/components/dashboard/EinOrderForm';
import {
  EinResponsiblePartyPanel,
  type EinPanelInitialState,
} from '@/components/wizard/EinResponsiblePartyPanel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function EinPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) return await redirectLocalized('/sign-in');
  const t = await getTranslations('einForm');
  const locale = (await getLocale()) === 'es' ? 'es' : 'en';

  const filing = await prisma.filing.findUnique({
    where: { id: params.id },
    include: {
      filingAdditionalServices: { include: { service: true } },
      einApplication: true,
      managersMembers: { orderBy: { position: 'asc' }, take: 1 },
      user: { select: { email: true, firstName: true, lastName: true } },
      payments: {
        where: { status: 'SUCCEEDED' },
        orderBy: { completedAt: 'desc' },
        take: 1,
        select: { cardLast4: true, cardBrand: true, cardholderName: true, stripePaymentMethodId: true },
      },
    },
  });
  if (!filing || filing.userId !== session.user.id) notFound();

  const entitled = filingIncludesEin({
    tier: filing.serviceTier as TierSlug,
    addOnSlugs: filing.filingAdditionalServices.map((f) => f.service.serviceSlug as AddOnSlug),
    createdAt: filing.createdAt,
  });
  const orderable = canOrderEin({ status: filing.status, entitled });
  if (!entitled && !orderable) return await redirectLocalized(`/dashboard/filings/${filing.id}`);

  const company = filing.businessName ?? '';
  const ein = filing.einApplication;

  let body: React.ReactNode;
  if (!entitled) {
    // Only offer the saved card when a reusable payment method is attached
    // (mirrors the Registered Agent renewal page).
    const last = filing.payments[0];
    const savedCard: EinSavedCard | null =
      last?.cardLast4 && last.stripePaymentMethodId
        ? {
            last4: last.cardLast4,
            brand: last.cardBrand ?? 'Card',
            cardholderName: last.cardholderName ?? '',
            paymentMethodId: last.stripePaymentMethodId,
          }
        : null;
    body = (
      <>
        <EinOrderForm
          filingId={filing.id}
          companyName={company}
          priceCents={ADD_ON_BY_SLUG.ein.serviceMarginCents}
          savedCard={savedCard}
        />
        <p className="text-xs text-ink-subtle leading-relaxed">{t('orderFreeNote')}</p>
      </>
    );
  } else if (ein?.status === 'submitted' || ein?.status === 'delivered') {
    body = (
      <Card>
        <CardContent className="p-6 space-y-3">
          <p className="text-sm text-ink-muted">
            {ein.status === 'submitted' ? t('statusSubmitted') : t('statusDelivered')}
          </p>
          {ein.status === 'delivered' && (
            <Link href={hrefForLocale('/dashboard/documents', locale)} className="text-sm font-semibold text-primary hover:underline">
              {t('docEinLetter')}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  } else {
    const initial: EinPanelInitialState = ein
      ? {
          collected: ein.status === 'ready_online' || ein.status === 'manual_foreign',
          pathway: ein.responsiblePartyType as 'us' | 'foreign',
          legalName: ein.legalName ?? undefined,
          title: ein.title ?? undefined,
          phone: ein.phone ?? undefined,
          email: ein.email ?? undefined,
          taxIdLast4: ein.taxIdLast4,
          taxIdType: ein.taxIdType,
          passportLast4: ein.passportLast4,
          countryOfCitizenship: ein.countryOfCitizenship,
        }
      : { collected: false };
    body = (
      <>
        <p className="text-sm text-ink-muted">{t('detailsIntro', { company })}</p>
        <EinResponsiblePartyPanel
          filingId={filing.id}
          initial={initial}
          defaultEmail={filing.user.email}
          defaultName={
            [filing.user.firstName, filing.user.lastName].filter(Boolean).join(' ') ||
            filing.managersMembers[0]?.name ||
            undefined
          }
        />
      </>
    );
  }

  return (
    <div className="container max-w-2xl py-10 space-y-6">
      <Link
        href={hrefForLocale(`/dashboard/filings/${filing.id}`, locale)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('orderBack')}
      </Link>

      <div>
        <p className="text-xs text-ink-subtle uppercase tracking-wider font-medium mb-1">
          {t('orderEyebrow')}
        </p>
        <h1 className="font-display text-3xl font-medium tracking-tight">{t('orderTitle')}</h1>
        <p className="text-sm text-ink-muted mt-2">{t('orderIntro', { company })}</p>
      </div>

      {body}
    </div>
  );
}
