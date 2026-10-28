/**
 * Generates the `/llms.txt` and `/llms-full.txt` documents.
 *
 * llms.txt is an emerging convention (https://llmstxt.org) that gives LLM
 * crawlers and AI answer engines a clean, curated markdown map of the site:
 * an H1 with the brand, a one-line blockquote summary, then link sections.
 * `/llms-full.txt` expands that with inline reference content (FAQ answers,
 * pricing/service overview) so models can answer from a single fetch.
 *
 * Both are built from the same source-of-truth modules used to render the
 * marketing site, so they stay in sync automatically.
 */

import { ALL_MARKETING_STATES, FLORIDA, localizedStateName } from '@/lib/marketing-states';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { tierPriceParts } from '@/lib/pricing';
import { isRetiredStateSlug } from '@/lib/retired-state-redirects';
import { formatCurrency } from '@/lib/utils';

const ESSENTIAL_FL_LLC = tierPriceParts('BASIC', 'LLC', 'FL');
const ESSENTIAL_PRICE = formatCurrency(ESSENTIAL_FL_LLC.totalCents);
const ESSENTIAL_STATE_FEE = formatCurrency(ESSENTIAL_FL_LLC.stateFeeCents);

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

const SUMMARY =
  'LaunchForma is a modern business formation service that files LLCs and Corporations in Florida with transparent all-in pricing (state fee included), a free Year-1 Registered Agent, and submission within 1 business day.';

const ABOUT =
  'LaunchForma helps founders form US companies without the upsells, hidden fees, or 45-minute forms common to legacy filing services. Every package includes the required state filing fee, free Year-1 Registered Agent service, and digital delivery of filed documents. Optional add-ons include Operating Agreements, S-Corp election (IRS Form 2553), managed annual reports, and compliance alerts. The company also files Florida annual reports. LaunchForma is not a law firm and does not provide legal advice.';

interface LinkEntry {
  title: string;
  path: string;
  note: string;
}

const CORE_PAGES: LinkEntry[] = [
  { title: 'Home', path: '/', note: 'Overview of LaunchForma formation services and pricing.' },
  { title: 'Pricing', path: '/pricing', note: 'All-in package pricing for LLC and Corporation formation; state fee included.' },
  { title: 'Services', path: '/services', note: 'Add-on services: Operating Agreement, S-Corp election, managed annual reports, compliance alerts.' },
  { title: 'FAQ', path: '/faq', note: 'Answers about formation, registered agent, annual reports, and timelines.' },
  { title: 'About', path: '/about', note: 'Company mission: transparent, all-in business formation.' },
  { title: 'Contact', path: '/contact', note: 'Phone, mailing address, and the service inquiry form.' },
  { title: 'LLC for Hair Stylists and Barbers', path: '/llc-for/stylists-barbers', note: `Florida LLC formation for hair stylists and barbers. Essential is ${ESSENTIAL_PRICE} and includes the ${ESSENTIAL_STATE_FEE} state fee. Spanish alternate: /es/llc-para/estilistas-barberos.` },
  { title: 'File an Annual Report', path: '/file-annual-report', note: 'Florida annual report filing service and deadlines.' },
  { title: 'BOI Reporting', path: '/boi-reporting', note: 'BOI update: U.S.-formed companies are exempt from FinCEN beneficial ownership reporting (August 2026 final rule).' },
  { title: 'States', path: '/states', note: 'States where LaunchForma files and coming-soon states.' },
  { title: 'Start a filing', path: '/start', note: 'Begin an LLC, Corporation, or S-Corp filing (no account required).' },
];

const GUIDES: LinkEntry[] = [
  { title: 'Guides index', path: '/guides', note: 'Long-form formation and compliance guides.' },
  { title: 'How to Form an LLC in Florida', path: '/guides/how-to-form-an-llc-in-florida', note: 'Steps, Division of Corporations fees, and what to do after Articles of Organization are filed.' },
  { title: 'Florida LLC Cost', path: '/guides/florida-llc-cost', note: 'State fees to form a Florida LLC ($125 = $100 filing + $25 registered agent), $138.75 annual report ($538.75 after May 1), free EIN, and commonly missed costs.' },
  { title: 'Cheapest way to form a Florida LLC', path: '/guides/cheapest-way-to-form-florida-llc', note: 'DIY on Sunbiz versus a filing service. State fee, registered agent street address, and the annual report from January 1 to May 1. No competitor prices.' },
  { title: 'Florida LLC for a non resident', path: '/guides/florida-llc-non-resident', note: 'No Florida residency requirement. Registered agent needs a Florida street address. Principal address can be outside Florida. Spanish article, when published: /es/guides/llc-florida-para-extranjeros.' },
  { title: 'Florida LLC without SSN', path: '/guides/florida-llc-without-ssn', note: 'Sunbiz has no SSN field. The EIN is issued by the IRS. Spanish article: /es/guides/llc-florida-sin-seguro-social.' },
  { title: 'How long to form a Florida LLC', path: '/guides/how-long-to-form-florida-llc', note: 'Sunbiz processes filings in the order received. See the Document Processing Dates page. LaunchForma submits within 1 business day. No promised state turnaround.' },
  { title: 'How to Form a Florida Corporation', path: '/guides/how-to-form-a-florida-corporation', note: 'Steps, Sunbiz fees ($70 to form, $150 annual report), and what to do after Articles of Incorporation are filed. Spanish alternate: /es/guides/how-to-form-a-florida-corporation.' },
  { title: 'Florida Fictitious Name (DBA)', path: '/guides/florida-fictitious-name-dba', note: 'Who needs a DBA, the $50 Sunbiz fee, newspaper ad, 5-year renewal, cancellation.' },
  { title: 'Florida Annual Report', path: '/guides/florida-annual-report', note: 'Deadline (January 1 through May 1), LLC and corporation fees, and late filing.' },
  { title: 'Florida Registered Agent', path: '/guides/florida-registered-agent', note: 'Who can serve, the street-address rule, and state fees to appoint or change an agent.' },
  { title: 'Florida LLC Operating Agreement', path: '/guides/florida-llc-operating-agreement', note: 'What a Florida LLC operating agreement is, what Chapter 605 says, and how to adopt one.' },
  { title: 'BOI Reporting Update 2026', path: '/guides/boi-filing-2026', note: 'Redirects to the BOI update: U.S.-formed companies are exempt from FinCEN beneficial ownership reporting.' },
];

const LEGAL: LinkEntry[] = [
  { title: 'Terms', path: '/terms', note: 'Terms of service.' },
  { title: 'Privacy Policy', path: '/privacy', note: 'How LaunchForma handles data, ad measurement, and the Do Not Sell or Share choice. Effective October 25, 2026.' },
  { title: 'Do Not Sell or Share', path: '/privacy-choices', note: 'Opt out of Google and OpenAI ad measurement. Global Privacy Control is honored.' },
  { title: 'Disclaimer', path: '/disclaimer', note: 'Not-a-law-firm disclaimer.' },
  { title: 'Refund Policy', path: '/refund-policy', note: 'Refund terms.' },
];

const SPANISH_PAGES: LinkEntry[] = [
  { title: 'Inicio (español)', path: '/es', note: 'Página de inicio en español.' },
  { title: 'Precios', path: '/es/pricing', note: 'Precios todo incluido, tarifa estatal incluida.' },
  { title: 'Servicios', path: '/es/services', note: 'Servicios adicionales: acuerdo operativo, elección S-Corp, reporte anual gestionado y alertas de cumplimiento.' },
  { title: 'Preguntas frecuentes', path: '/es/faq', note: 'Preguntas sobre formación, agente registrado y reportes anuales.' },
  { title: 'Nosotros', path: '/es/about', note: 'Qué es LaunchForma y cómo trabajamos.' },
  { title: 'Contacto', path: '/es/contacto', note: 'Teléfono, dirección postal y el formulario de servicios.' },
  { title: 'LLC para estilistas y barberos', path: '/es/llc-para/estilistas-barberos', note: `LLC en Florida para estilistas y barberos. Esencial cuesta ${ESSENTIAL_PRICE} e incluye la tarifa estatal de ${ESSENTIAL_STATE_FEE}. Alterna en inglés: /llc-for/stylists-barbers.` },
  { title: 'Reporte anual', path: '/es/file-annual-report', note: 'Presentación del reporte anual de Florida.' },
  { title: 'Informe BOI', path: '/es/boi-reporting', note: 'Actualización BOI: las empresas formadas en EE. UU. están exentas (regla final del 11 de agosto de 2026, fincen.gov/boi).' },
  { title: 'Estados', path: '/es/states', note: 'Estados donde LaunchForma presenta trámites.' },
  { title: 'Florida', path: '/es/states/florida', note: 'Formar una LLC o corporación en Florida.' },
  { title: 'Empezar un trámite', path: '/es/start', note: 'Empieza una LLC, corporación o elección S-Corp sin crear cuenta.' },
  { title: 'Guías', path: '/es/guides', note: 'Índice de guías en español.' },
  { title: 'Cómo formar una LLC en Florida', path: '/es/guides/how-to-form-an-llc-in-florida', note: 'Pasos, tarifas de la División de Corporaciones y qué hacer después de los Articles of Organization.' },
  { title: 'Cómo formar una corporación en Florida', path: '/es/guides/how-to-form-a-florida-corporation', note: 'Pasos, tarifas de Sunbiz ($70 para formarla, $150 el reporte anual) y qué hacer después de los Articles of Incorporation. Alterna en inglés: /guides/how-to-form-a-florida-corporation.' },
  { title: 'Reporte anual de Florida', path: '/es/guides/florida-annual-report', note: 'Fecha (1 de enero al 1 de mayo), tarifas de LLC y corporación, y presentación tardía.' },
  { title: 'Agente registrado en Florida', path: '/es/guides/florida-registered-agent', note: 'Quién puede serlo, la regla de dirección física y las tarifas estatales para designar o cambiar al agente.' },
  { title: 'Acuerdo operativo de Florida', path: '/es/guides/florida-llc-operating-agreement', note: 'Para qué sirve un acuerdo operativo de LLC en Florida.' },
  { title: 'LLC en Florida sin Seguro Social', path: '/es/guides/llc-florida-sin-seguro-social', note: 'Qué pide Sunbiz si no tienes SSN, y qué dice el IRS sobre el EIN y el ITIN. LaunchForma no tramita el EIN.' },
  { title: 'Licencia de negocio en Miami-Dade', path: '/es/guides/licencia-negocio-miami-dade', note: 'Recibo de impuesto de negocio del condado de Miami-Dade y de la Ciudad de Miami, después de la LLC.' },
  { title: 'Licencia de negocio en Broward', path: '/es/guides/licencia-negocio-broward', note: 'Business Tax Receipt del condado de Broward y de Fort Lauderdale, incluido el Certificado de Uso.' },
  { title: 'LLC o negocio individual', path: '/es/guides/llc-o-negocio-individual-florida', note: 'Cómo define el IRS cada figura y qué cobra Sunbiz por la LLC, el reporte anual y el nombre ficticio.' },
  { title: 'LLC para tu app', path: '/es/guides/llc-para-tu-app-florida', note: 'Qué piden Apple y Google para una cuenta de organización, y cómo encaja una LLC de Florida.' },
  { title: 'Términos (borrador)', path: '/es/terms', note: 'Traducción en borrador. La versión en inglés es la que rige: /terms.' },
  { title: 'Política de privacidad', path: '/es/privacy', note: 'Qué recopilamos, con quién lo compartimos y cómo excluirte de la medición de anuncios. Vigente desde el 25 de octubre de 2026.' },
  { title: 'No vender ni compartir', path: '/es/privacy-choices', note: 'Exclusión de la medición de anuncios de Google y OpenAI. Se respeta Global Privacy Control.' },
  { title: 'Aviso legal (borrador)', path: '/es/disclaimer', note: 'Traducción en borrador. La versión en inglés es la que rige: /disclaimer.' },
  { title: 'Reembolsos (borrador)', path: '/es/refund-policy', note: 'Traducción en borrador. La versión en inglés es la que rige: /refund-policy.' },
];

function line(entry: LinkEntry): string {
  return `- [${entry.title}](${BASE_URL}${entry.path}): ${entry.note}`;
}

function published(entries: LinkEntry[]): string[] {
  return entries.map(line);
}

function stateLines(): string[] {
  const active = ALL_MARKETING_STATES.filter(
    (s) => s.availability === 'active' && !isRetiredStateSlug(s.slug),
  );
  return active.map((s) => {
    return `- [${s.name} LLC & Corporation formation](${BASE_URL}/states/${s.slug}): File a ${s.name} LLC or Corporation with all-in pricing and free Year-1 Registered Agent.`;
  });
}

/** Curated llms.txt: brand, summary, and grouped link sections. */
export function buildLlmsTxt(): string {
  const parts: string[] = [];
  parts.push('# LaunchForma');
  parts.push('');
  parts.push(`> ${SUMMARY}`);
  parts.push('');
  parts.push(ABOUT);
  parts.push('');
  parts.push('## Core pages');
  parts.push(...published(CORE_PAGES));
  parts.push('');
  parts.push('## Guides');
  parts.push(...published(GUIDES));
  parts.push('');
  parts.push('## States');
  parts.push(...stateLines());
  parts.push('');
  parts.push('## Legal');
  parts.push(...published(LEGAL));
  parts.push('');
  parts.push('## Español');
  parts.push(
    'Páginas en español neutro. Forma, el asistente, guía el pedido. El equipo de LaunchForma presenta el trámite ante el estado. No es asesoría legal ni fiscal. Los términos, el aviso legal y la política de reembolso en español siguen en borrador y rige la versión en inglés.',
  );
  parts.push(...published(SPANISH_PAGES));
  parts.push('');
  parts.push('## Optional');
  parts.push(
    `- [Full text export](${BASE_URL}/llms-full.txt): Expanded version of this file with inline FAQ answers.`,
  );
  parts.push(`- [Sitemap](${BASE_URL}/sitemap.xml): Machine-readable list of all indexable URLs.`);
  parts.push('');
  return parts.join('\n');
}

/** Expanded llms-full.txt: everything in llms.txt plus inline FAQ content. */
export function buildLlmsFullTxt(): string {
  const parts: string[] = [];
  parts.push(buildLlmsTxt().trimEnd());
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## Frequently asked questions');
  parts.push('');

  const faq = getMarketingFaq(FLORIDA, 'en');
  for (const item of faq) {
    parts.push(`### ${item.q}`);
    parts.push(item.a);
    parts.push('');
  }

  parts.push('---');
  parts.push('');
  parts.push('## Coverage');
  const coming = ALL_MARKETING_STATES.filter((s) => s.availability === 'coming_soon')
    .map((s) => localizedStateName(s, 'en'))
    .join(', ');
  parts.push(
    `LaunchForma files today in Florida. Waitlists are open for other US states: ${coming}.`,
  );
  parts.push('');
  return parts.join('\n');
}
