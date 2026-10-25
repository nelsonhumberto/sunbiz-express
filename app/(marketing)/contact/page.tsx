import type { Metadata } from 'next';
import { Phone, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { ServiceInquiryForm } from '@/components/marketing/ServiceInquiryForm';
import {
  BUSINESS_ADDRESS,
  CONTACT_PHONE_DISPLAY,
  CONTACT_PHONE_E164,
} from '@/lib/constants';
import { withLocaleMeta } from '@/lib/locale-seo';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations('contactPage');
  const title = t('metaTitle');
  const description = t('metaDescription', { phone: CONTACT_PHONE_DISPLAY });
  return withLocaleMeta(
    '/contact',
    {
      title,
      description,
      openGraph: {
        title: t('ogTitle'),
        description: t('ogDescription'),
        type: 'website',
      },
    },
    locale,
  );
}

export default async function ContactPage() {
  const t = await getTranslations('contactPage');

  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
              {t('heading')}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-ink-muted leading-relaxed">{t('intro')}</p>
            <dl className="mt-8 space-y-6">
              <div className="flex gap-3">
                <Phone className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    {t('phoneLabel')}
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={`tel:${CONTACT_PHONE_E164}`}
                      data-testid="contact-phone"
                      className="inline-flex min-h-11 items-center text-lg font-medium text-primary hover:underline"
                    >
                      {CONTACT_PHONE_DISPLAY}
                    </a>
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                    {t('addressLabel')}
                  </dt>
                  <dd className="mt-1">
                    <address
                      data-testid="contact-address"
                      className="not-italic text-base leading-relaxed text-ink"
                    >
                      {BUSINESS_ADDRESS}
                    </address>
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div
            id="request"
            className="scroll-mt-24 rounded-2xl border border-border bg-white p-5 sm:p-8 ring-card"
          >
            <h2 className="font-display text-2xl md:text-3xl font-medium tracking-tight">
              {t('formHeading')}
            </h2>
            <p className="mt-3 text-ink-muted leading-relaxed">{t('formIntro')}</p>
            <ServiceInquiryForm />
          </div>
        </div>
      </div>
    </section>
  );
}
