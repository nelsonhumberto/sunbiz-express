import { ADD_ONS } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CTABanner } from '@/components/marketing/CTABanner';
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
  type LucideIcon,
} from 'lucide-react';

export const metadata = { title: 'Services' };

const ICONS: Record<string, LucideIcon> = {
  ShieldCheck, Hash, FileText, Users, Globe, Award, FileCheck, CalendarCheck, Receipt, BellRing,
};

export default function ServicesPage() {
  const byCategory = {
    formation: ADD_ONS.filter((a) => a.category === 'formation'),
    compliance: ADD_ONS.filter((a) => a.category === 'compliance'),
    branding: ADD_ONS.filter((a) => a.category === 'branding'),
  };

  return (
    <>
      <section className="pt-16 pb-12">
        <div className="container max-w-3xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Services
          </span>
          <h1 className="mt-3 font-display text-5xl md:text-6xl font-medium tracking-tight">
            Everything you need —{' '}
            <span className="italic">all in one place.</span>
          </h1>
          <p className="mt-6 text-lg text-ink-muted leading-relaxed">
            Formation is just the start. We help you stay compliant, look professional, and avoid
            costly mistakes year after year.
          </p>
        </div>
      </section>

      <ServiceCategory id="formation" title="Formation" subtitle="Everything to get your business legally formed and bank-ready." services={byCategory.formation} />
      <ServiceCategory id="compliance" title="Compliance" subtitle="Stay on the right side of the state — no more $400 late fees." services={byCategory.compliance} />
      <ServiceCategory id="branding" title="Branding" subtitle="Establish your online identity from day one." services={byCategory.branding} />

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
  services: typeof ADD_ONS;
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
                    {service.recurring && (
                      <span className="text-xs text-ink-subtle">/ {service.recurring}</span>
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
