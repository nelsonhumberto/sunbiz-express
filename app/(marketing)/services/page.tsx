import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { WIZARD_ADD_ONS, type AddOnDef } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CTABanner } from '@/components/marketing/CTABanner';
import { JsonLd, servicesItemListJsonLd } from '@/components/seo/JsonLd';
import { withLocaleMeta } from '@/lib/locale-seo';
import {
  ShieldCheck,
  Hash,
  FileText,
  Users,
  Globe,
  Award,
  FileCheck,
  CalendarCheck,
  Receipt,
  BellRing,
  Landmark,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck, Hash, FileText, Users, Globe, Award, FileCheck, CalendarCheck, Receipt, BellRing, Landmark,
};

// State-issued certificates are delivered inside formation packages but never
// advertised as standalone purchases (Google Ads restricts promoting direct
// acquisition of government documents).
const LISTED_SERVICES = WIZARD_ADD_ONS.filter(
  (a) => a.slug !== 'cert_status' && a.slug !== 'cert_copy',
);

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  if (locale === 'es') {
    const t = await getTranslations('servicesPage');
    return withLocaleMeta(
      '/services',
      {
        title: t('metaTitle'),
        description: t('metaDescription'),
        openGraph: {
          title: t('ogTitle'),
          description: t('ogDescription'),
          type: 'website',
        },
      },
      locale,
    );
  }
  const title = 'Add-On Services - Registered Agent, Operating Agreements, Compliance';
  const description =
    'A la carte business formation services: Registered Agent, Operating Agreement, S-Corp election, managed annual reports, and compliance alerts - transparent pricing with no upsell tricks.';
  return withLocaleMeta(
    '/services',
    {
      title,
      description,
      openGraph: {
        title: 'LaunchForma Services - Formation, Compliance, Branding',
        description:
          'Everything you need to form, fund, and run your LLC or Corporation - a la carte add-ons with transparent pricing.',
        type: 'website',
      },
    },
    locale,
  );
}

export default async function ServicesPage() {
  const locale = await getLocale();
  const t = locale === 'es' ? await getTranslations('servicesPage') : null;

  const listed = LISTED_SERVICES.map((service) => ({
    ...service,
    name: t ? t(`addons.${service.slug}.name`) : service.name,
    description: t ? t(`addons.${service.slug}.description`) : service.description,
    badge: service.badge && t ? t(`addons.${service.slug}.badge`) : service.badge,
    recurringLabel: service.recurring ? (t ? t('perYear') : service.recurring) : undefined,
  }));

  const byCategory = {
    formation: listed.filter((a) => a.category === 'formation'),
    compliance: listed.filter((a) => a.category === 'compliance'),
    branding: listed.filter((a) => a.category === 'branding'),
  };

  return (
    <>
      <JsonLd
        data={servicesItemListJsonLd(
          listed.map((a) => ({
            name: a.name,
            description: a.description,
            priceCents: a.priceCents,
          })),
          t ? t('listName') : undefined,
        )}
      />
      <section className="pt-16 pb-12">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t ? t('kicker') : 'Services'}
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            {t ? t('titleH1') : 'Registered agent and LLC formation services'}
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            {t
              ? t('intro')
              : 'Formation is just the start. We help you stay compliant, look professional, and avoid costly mistakes year after year.'}
          </p>
        </div>
      </section>

      <ServiceCategory
        id="formation"
        title={t ? t('formationTitle') : 'Formation'}
        subtitle={
          t
            ? t('formationSubtitle')
            : 'Everything to get your business legally formed and bank-ready.'
        }
        services={byCategory.formation}
      />
      <ServiceCategory
        id="compliance"
        title={t ? t('complianceTitle') : 'Compliance'}
        subtitle={
          t
            ? t('complianceSubtitle')
            : 'Stay on the right side of every state - annual reports and franchise tax handled before deadlines bite.'
        }
        services={byCategory.compliance}
      />
      <ServiceCategory
        id="branding"
        title={t ? t('brandingTitle') : 'Branding'}
        subtitle={t ? t('brandingSubtitle') : 'Establish your online identity from day one.'}
        services={byCategory.branding}
      />

      <CTABanner />
    </>
  );
}

function ServiceCategory({
  id,
  title,
  subtitle,
  services,
}: {
  id: string;
  title: string;
  subtitle: string;
  services: Array<AddOnDef & { recurringLabel?: string }>;
}) {
  return (
    <section id={id} className="py-12 md:py-16">
      <div className="container max-w-6xl">
        <div className="mb-10">
          <h2 className="font-display text-3xl md:text-4xl font-medium tracking-tight">{title}</h2>
          <p className="mt-2 text-ink-muted">{subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => {
            const Icon = ICONS[service.iconKey] ?? FileText;
            return (
              <Card key={service.slug} className="hover:shadow-card transition-shadow">
                <CardContent className="p-6 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${service.highlight ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {service.badge && <Badge variant="success" size="sm">{service.badge}</Badge>}
                  </div>
                  <h3 className="font-semibold text-lg leading-tight">{service.name}</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">{service.description}</p>
                  <div className="flex items-baseline justify-between pt-2 border-t border-border">
                    <span className="font-display text-2xl font-medium">
                      {formatCurrency(service.priceCents, { showZero: true })}
                    </span>
                    {service.recurringLabel && (
                      <span className="text-xs text-ink-subtle">/ {service.recurringLabel}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
