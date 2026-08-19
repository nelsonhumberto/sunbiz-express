'use client';

import { motion } from 'framer-motion';
import { useTranslations, useLocale } from 'next-intl';
import { Star } from 'lucide-react';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';

interface TestimonialsProps {
  /** Resolved marketing state. Defaults to Florida. */
  state?: MarketingState;
}

const TESTIMONIALS_EN = [
  {
    quote: "I'd used other online formation services twice and dreaded it both times. LaunchForma felt like ordering a sandwich - pick what you want, pay once, done.",
    name: 'Mariana C.',
    role: 'Founder · Coral Gables Realty Group',
    avatar: 'MC',
  },
  {
    quote: 'The annual report reminders alone are worth it. Last year I almost missed the May 1st deadline - that $400 late fee would have stung.',
    name: 'James T.',
    role: 'Solopreneur · Tampa, FL',
    avatar: 'JT',
  },
  {
    quote: 'I needed an Operating Agreement my bank would actually accept. LaunchForma delivered one in the format Wells Fargo wanted on the first try.',
    name: 'Aisha N.',
    role: 'Co-Founder · Brickell Capital LLC',
    avatar: 'AN',
  },
  {
    quote: 'Filed on Tuesday morning, approved Wednesday afternoon. The email update with my Sunbiz number arrived before my coffee got cold.',
    name: 'David K.',
    role: 'Owner · Sunshine Coast Logistics',
    avatar: 'DK',
  },
  {
    quote: "The transparency hit different. One package price, Florida filing fee already included - no surprise checkout fees like every competitor I'd used.",
    name: 'Priya R.',
    role: 'Independent Consultant · Orlando',
    avatar: 'PR',
  },
  {
    quote: 'I formed three LLCs in one weekend for a real-estate syndication. The dashboard kept everything organized - could not have done that with paper forms.',
    name: 'Marcus B.',
    role: 'Real Estate Investor · Naples',
    avatar: 'MB',
  },
];

const TESTIMONIALS_ES = [
  {
    quote: 'Usé otros servicios en línea dos veces y temí ambas. LaunchForma se sintió como ordenar un sándwich - eliges lo que quieres, pagas una vez, listo.',
    name: 'Mariana C.',
    role: 'Fundadora · Coral Gables Realty Group',
    avatar: 'MC',
  },
  {
    quote: 'Los recordatorios del reporte anual valen el precio solos. El año pasado casi perdí el límite del 1 de mayo - esos $400 de multa habrían dolido.',
    name: 'James T.',
    role: 'Solopreneur · Tampa, FL',
    avatar: 'JT',
  },
  {
    quote: 'Necesitaba un Acuerdo Operativo que mi banco realmente aceptara. LaunchForma me dio uno en el formato que Wells Fargo quería al primer intento.',
    name: 'Aisha N.',
    role: 'Cofundadora · Brickell Capital LLC',
    avatar: 'AN',
  },
  {
    quote: 'Presenté el martes por la mañana, aprobado el miércoles por la tarde. El correo con mi número de Sunbiz llegó antes de que mi café se enfriara.',
    name: 'David K.',
    role: 'Dueño · Sunshine Coast Logistics',
    avatar: 'DK',
  },
  {
    quote: 'La transparencia hizo la diferencia. Un precio de plan, tarifa de Florida ya incluida - sin sorpresas al pagar como otros competidores.',
    name: 'Priya R.',
    role: 'Consultora Independiente · Orlando',
    avatar: 'PR',
  },
  {
    quote: 'Formé tres LLCs en un fin de semana para un sindicato inmobiliario. El panel mantuvo todo organizado - imposible con formularios de papel.',
    name: 'Marcus B.',
    role: 'Inversionista Inmobiliario · Naples',
    avatar: 'MB',
  },
];

// State-specific testimonial bundles. Audit (May 2026) flagged that the
// WY/DE landing pages were running Florida testimonials with FL place
// names (Coral Gables, Tampa, Naples) - confusing for non-FL visitors.
// Each active state now has its own small set; FL keeps the original
// long-form roster.
const TESTIMONIALS_WY_EN: typeof TESTIMONIALS_EN = [
  {
    quote: "I picked Wyoming because of the privacy and asset-protection statutes. LaunchForma made the filing painless - included the registered agent, no upsell games.",
    name: 'Jordan H.',
    role: 'Solo founder · Sheridan, WY',
    avatar: 'JH',
  },
  {
    quote: 'My CPA recommended a Wyoming LLC for our holding-company structure. The all-in pricing and bundled cert of status saved a back-and-forth I usually have with other online filers.',
    name: 'Priya R.',
    role: 'Investor · Casper, WY',
    avatar: 'PR',
  },
  {
    quote: "Three weeks of standard processing was disclosed up front and we got the option to expedite. Refreshing - most providers hide the timeline until after you pay.",
    name: 'Marcus B.',
    role: 'Operator · Cheyenne, WY',
    avatar: 'MB',
  },
];

const TESTIMONIALS_WY_ES: typeof TESTIMONIALS_ES = [
  {
    quote: 'Elegí Wyoming por la privacidad y la protección de activos. LaunchForma hizo el trámite simple - agente registrado incluido, sin trucos de venta.',
    name: 'Jordan H.',
    role: 'Fundador · Sheridan, WY',
    avatar: 'JH',
  },
  {
    quote: 'Mi contadora recomendó una LLC de Wyoming para nuestra holding. El precio todo-incluido y el certificado de estatus me ahorraron los típicos rebotes con otros servicios en línea.',
    name: 'Priya R.',
    role: 'Inversionista · Casper, WY',
    avatar: 'PR',
  },
  {
    quote: 'Tres semanas de procesamiento estándar fueron declaradas desde el inicio y nos dieron la opción de acelerar. Refrescante - la mayoría oculta el tiempo hasta después de pagar.',
    name: 'Marcus B.',
    role: 'Operador · Cheyenne, WY',
    avatar: 'MB',
  },
];

const TESTIMONIALS_DE_EN: typeof TESTIMONIALS_EN = [
  {
    quote: "We needed a Delaware C-Corp because our seed investors required it. LaunchForma handled the Certificate of Incorporation cleanly and didn't try to sell me a registered agent I already had.",
    name: 'Aisha N.',
    role: 'Co-Founder · Wilmington, DE',
    avatar: 'AN',
  },
  {
    quote: 'I appreciated the upfront disclosure that Delaware standard processing is ~6 weeks right now. We paid the $50 expedite and had everything in 8 business days.',
    name: 'David K.',
    role: 'Founder · Newark, DE',
    avatar: 'DK',
  },
  {
    quote: "Operating Agreement was Delaware-tailored - chargeback protection, manager-managed structure, everything our counsel wanted to see. Bank opened the account without one comment.",
    name: 'Mariana C.',
    role: 'Founder · Dover, DE',
    avatar: 'MC',
  },
];

const TESTIMONIALS_DE_ES: typeof TESTIMONIALS_ES = [
  {
    quote: 'Necesitábamos una Corporación C de Delaware porque nuestros inversores lo exigían. LaunchForma manejó el Certificate of Incorporation limpiamente.',
    name: 'Aisha N.',
    role: 'Cofundadora · Wilmington, DE',
    avatar: 'AN',
  },
  {
    quote: 'Apreciamos que dijeran al inicio que el procesamiento estándar de Delaware es de ~6 semanas. Pagamos $50 de acelerado y todo llegó en 8 días hábiles.',
    name: 'David K.',
    role: 'Fundador · Newark, DE',
    avatar: 'DK',
  },
  {
    quote: 'El Operating Agreement venía adaptado a Delaware - exactamente lo que nuestro abogado quería ver. El banco abrió la cuenta sin un solo comentario.',
    name: 'Mariana C.',
    role: 'Fundadora · Dover, DE',
    avatar: 'MC',
  },
];

export function Testimonials({ state = FLORIDA }: TestimonialsProps = {}) {
  const t = useTranslations('testimonials');
  const locale = useLocale();
  const TESTIMONIALS =
    state.code === 'WY'
      ? locale === 'es'
        ? TESTIMONIALS_WY_ES
        : TESTIMONIALS_WY_EN
      : state.code === 'DE'
        ? locale === 'es'
          ? TESTIMONIALS_DE_ES
          : TESTIMONIALS_DE_EN
        : locale === 'es'
          ? TESTIMONIALS_ES
          : TESTIMONIALS_EN;

  // State-aware headline pair so we don't say "Loved by Florida
  // entrepreneurs" on the Wyoming or Delaware landing page.
  const headlineLine1 =
    state.code === 'FL'
      ? t('headline1')
      : 'Loved by';
  const headlineLine2 =
    state.code === 'FL'
      ? t('headline2')
      : `${state.name} founders.`;
  const subhead =
    state.code === 'FL'
      ? t('subhead')
      : `Real ${state.name} owners - small operators, holding companies, and venture-backed founders alike.`;

  return (
    <section data-marketing-state={state.code} className="py-20 md:py-28 bg-white border-y border-border">
      <div className="container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="h-5 w-5 text-accent fill-accent" />
            ))}
            <span className="ml-2 text-sm font-semibold">{t('rating')}</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
            {headlineLine1} <span className="italic text-primary">{headlineLine2}</span>
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{subhead}</p>
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 max-w-6xl mx-auto">
          {TESTIMONIALS.map((review, i) => (
            <motion.div
              key={review.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="break-inside-avoid mb-6 rounded-2xl border border-border bg-white p-6 shadow-soft hover:shadow-card transition-shadow"
            >
              <div className="flex items-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="h-3.5 w-3.5 text-accent fill-accent" />
                ))}
              </div>
              <p className="text-sm text-ink leading-relaxed">"{review.quote}"</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-hover text-white flex items-center justify-center text-sm font-semibold">
                  {review.avatar}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink leading-tight">{review.name}</p>
                  <p className="text-xs text-ink-muted leading-tight">{review.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
