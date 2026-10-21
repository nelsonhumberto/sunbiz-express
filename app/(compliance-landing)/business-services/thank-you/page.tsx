import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Mail, MapPin } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LeadConversionTracker } from '@/components/analytics/LeadConversionTracker';
import { ComplianceLandingFooter } from '@/components/marketing/ComplianceLandingFooter';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import {
  BUSINESS_ADDRESS,
  BUSINESS_EMAIL,
  BUSINESS_LEGAL_NAME,
  BUSINESS_PHONE,
} from '@/lib/constants';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessServices');
  const title = t('thankYouMetaTitle');
  const description = t('thankYouMetaDescription');
  return {
    title,
    description,
    keywords: ['registered agent', 'operating agreement', 'compliance reminders', 'LaunchForma'],
    robots: { index: false, follow: false },
    alternates: { canonical: '/business-services/thank-you' },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function BusinessServicesThankYouPage() {
  const t = await getTranslations('businessServices');
  const tDisc = await getTranslations('disclosure');
  const phoneHref = BUSINESS_PHONE.replace(/[^\d+]/g, '');

  return (
    <>
      <Suspense fallback={null}>
        <LeadConversionTracker />
      </Suspense>

      <div className="bg-amber-50/60 border-b border-amber-200">
        <div className="container py-4">
          <GovDisclosure variant="prominent" text={tDisc('notAffiliatedServices')} />
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="container max-w-2xl">
          <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
            {t('thankYouHeadline')}
          </h1>
          <p className="mt-4 text-lg text-ink-muted leading-relaxed">{t('thankYouBody')}</p>
          <p className="mt-4 text-sm text-ink-muted leading-relaxed">{t('notALawFirm')}</p>

          <dl className="mt-10 space-y-4 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                {t('legalNameLabel')}
              </dt>
              <dd className="mt-1 font-medium text-ink">{BUSINESS_LEGAL_NAME}</dd>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 text-primary shrink-0" aria-hidden />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  {t('addressLabel')}
                </dt>
                <dd className="mt-1 text-ink">{BUSINESS_ADDRESS}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-primary shrink-0" aria-hidden />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  {t('emailLabel')}
                </dt>
                <dd className="mt-1">
                  <a className="font-medium text-primary hover:underline" href={`mailto:${BUSINESS_EMAIL}`}>
                    {BUSINESS_EMAIL}
                  </a>
                </dd>
              </div>
            </div>
            {BUSINESS_PHONE ? (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                  {t('phoneLabel')}
                </dt>
                <dd className="mt-1">
                  <a className="font-medium text-primary hover:underline" href={`tel:${phoneHref}`}>
                    {BUSINESS_PHONE}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      <ComplianceLandingFooter />
    </>
  );
}
