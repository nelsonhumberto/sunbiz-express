import type { Metadata } from 'next';
import Link from 'next/link';
import { BellRing, Check, FileText, Mail, MapPin, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { GovDisclosure } from '@/components/marketing/GovDisclosure';
import {
  BUSINESS_ADDRESS,
  BUSINESS_EMAIL,
  BUSINESS_LEGAL_NAME,
  BUSINESS_PHONE,
} from '@/lib/constants';
import {
  ADD_ON_BY_SLUG,
  RA_RENEWAL_PRICE_CENTS,
} from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

// Paid-traffic page for services outside Google's "Government documents and
// official services" policy. noindex matches /offer: it exists to convert ad
// clicks, not to compete with the public site in search.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('businessServices');
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    keywords: ['registered agent', 'operating agreement', 'compliance reminders', 'LaunchForma'],
    robots: { index: false, follow: true },
    alternates: { canonical: '/business-services' },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

function mailHref(subject: string) {
  return `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export default async function BusinessServicesPage() {
  const t = await getTranslations('businessServices');
  const tDisc = await getTranslations('disclosure');
  const tFooter = await getTranslations('footer');

  // Registered-agent year 1 is $0 only inside a formation package. This page
  // sells the service on its own, at the renewal price.
  const agentPrice = formatCurrency(RA_RENEWAL_PRICE_CENTS);
  const singlePrice = formatCurrency(
    ADD_ON_BY_SLUG.operating_agreement_single.serviceMarginCents,
  );
  const multiPrice = formatCurrency(
    ADD_ON_BY_SLUG.operating_agreement_multi.serviceMarginCents,
  );
  const alertsPrice = formatCurrency(ADD_ON_BY_SLUG.compliance_alerts.serviceMarginCents);
  const phoneHref = BUSINESS_PHONE.replace(/[^\d+]/g, '');

  return (
    <>
      <div className="bg-amber-50/60 border-b border-amber-200">
        <div className="container py-4">
          <GovDisclosure variant="prominent" text={tDisc('notAffiliatedServices')} />
        </div>
      </div>

      <section className="relative overflow-hidden pt-14 pb-12 md:pt-20 md:pb-16">
        <div className="absolute inset-0 mesh-bg" />
        <div className="aurora" />
        <div className="container relative max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('badge')}
          </span>
          <h1 className="mt-4 font-display text-4xl md:text-6xl font-medium tracking-tight text-balance">
            {t('headline')}
          </h1>
          <p className="mt-4 text-lg text-ink-muted leading-relaxed max-w-xl mx-auto">
            {t('subhead')}
          </p>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink">
            {[t('pointAgent'), t('pointDocs'), t('pointAlerts')].map((point) => (
              <li key={point} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Button asChild size="xl" className="text-base shadow-xl">
              <Link href="#services">{t('seeServices')}</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-ink-muted">{t('notALawFirm')}</p>
        </div>
      </section>

      <section id="services" className="scroll-mt-20 py-16 md:py-20">
        <div className="container max-w-5xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {t('servicesKicker')}
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
              {t('servicesHeadline')}
            </h2>
            <p className="mt-4 text-lg text-ink-muted leading-relaxed">{t('servicesSubhead')}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ServiceCard
              icon={<ShieldCheck className="h-5 w-5 text-primary" />}
              title={t('agentTitle')}
              body={t('agentBody')}
              price={t('serviceFeeYear', { price: agentPrice })}
              points={[t('agentPoint1'), t('agentPoint2'), t('agentPoint3')]}
              cta={t('request')}
              href={mailHref(t('mailAgent'))}
            />
            <ServiceCard
              icon={<BellRing className="h-5 w-5 text-primary" />}
              title={t('alertsTitle')}
              body={t('alertsBody')}
              price={t('serviceFeeYear', { price: alertsPrice })}
              points={[t('alertsPoint1'), t('alertsPoint2'), t('alertsPoint3')]}
              cta={t('request')}
              href={mailHref(t('mailAlerts'))}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-white p-6 md:p-8 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {t('docsKicker')}
                </p>
                <h3 className="font-display text-2xl font-medium">{t('docsTitle')}</h3>
              </div>
            </div>
            <p className="mt-4 text-sm text-ink-muted leading-relaxed max-w-3xl">{t('docsBody')}</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <DocOffer
                title={t('oaSingleTitle')}
                body={t('oaSingleBody')}
                price={t('serviceFee', { price: singlePrice })}
                cta={t('request')}
                href={mailHref(t('mailDocs'))}
              />
              <DocOffer
                title={t('oaMultiTitle')}
                body={t('oaMultiBody')}
                price={t('serviceFee', { price: multiPrice })}
                cta={t('request')}
                href={mailHref(t('mailDocs'))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-white border-y border-border">
        <div className="container max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t('contactKicker')}
          </span>
          <h2 className="mt-3 font-display text-4xl font-medium tracking-tight">
            {t('contactHeadline')}
          </h2>
          <p className="mt-4 text-lg text-ink-muted leading-relaxed">{t('contactBody')}</p>
          <dl className="mt-8 space-y-4 text-sm">
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
          <p className="mt-8 text-sm text-ink-muted leading-relaxed">{t('guarantee')}</p>
        </div>
      </section>

      <footer className="bg-[#0D1B2A] text-white">
        <div className="container py-10 flex flex-col gap-4">
          <p className="text-sm text-white/80">
            {BUSINESS_LEGAL_NAME}
            <span className="text-white/40"> · </span>
            {BUSINESS_ADDRESS}
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link className="text-white/70 hover:text-white" href="/terms">{tFooter('terms')}</Link>
            <Link className="text-white/70 hover:text-white" href="/privacy">{tFooter('privacy')}</Link>
            <Link className="text-white/70 hover:text-white" href="/refund-policy">{tFooter('refundPolicy')}</Link>
            <Link className="text-white/70 hover:text-white" href="/disclaimer">{tFooter('disclaimer')}</Link>
          </nav>
          <p className="max-w-3xl text-sm leading-relaxed text-white/70">{tDisc('notAffiliatedServices')}</p>
        </div>
      </footer>
    </>
  );
}

function ServiceCard({
  icon,
  title,
  body,
  price,
  points,
  cta,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  price: string;
  points: string[];
  cta: string;
  href: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-6 md:p-8 shadow-soft flex flex-col">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
      <h3 className="mt-4 font-display text-2xl font-medium">{title}</h3>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{body}</p>
      <p className="mt-4 text-sm font-semibold text-ink">{price}</p>
      <ul className="mt-4 space-y-2 flex-1">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-ink">
            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" strokeWidth={3} />
            {point}
          </li>
        ))}
      </ul>
      <Button asChild className="mt-6 w-full">
        <a href={href}>{cta}</a>
      </Button>
    </article>
  );
}

function DocOffer({
  title,
  body,
  price,
  cta,
  href,
}: {
  title: string;
  body: string;
  price: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="rounded-xl border border-border p-5 flex flex-col">
      <h4 className="font-semibold text-ink">{title}</h4>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed flex-1">{body}</p>
      <p className="mt-3 text-sm font-semibold text-ink">{price}</p>
      <Button asChild variant="outline" className="mt-4">
        <a href={href}>{cta}</a>
      </Button>
    </div>
  );
}
