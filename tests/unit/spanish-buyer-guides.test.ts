import { cloneElement, createElement, isValidElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { GuideValueCopy } from '@/components/marketing/GuideValueBlock';
import { buildLlmsTxt } from '@/lib/llms';
import { pathForLocale, toSpanishUrl } from '@/lib/locale-paths';
import { isSpanishOnlyGuidePath } from '@/lib/spanish-guide-links';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import es from '../../messages/es.json';

const request = vi.hoisted(() => ({ path: '/es/guides/costo-llc-florida' }));

vi.mock('next/headers', () => ({
  headers: () => ({
    get: (name: string) => (name === 'x-lf-public-path' ? request.path : null),
  }),
}));

vi.mock('next/navigation', () => ({
  permanentRedirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => createElement('a', { href, ...rest }, children),
}));

vi.mock('@/components/marketing/CTABanner', () => ({
  CTABanner: () => null,
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'es',
  getTranslations: async (ns: string) => {
    const messages = JSON.parse(readFileSync('messages/es.json', 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    const bag = messages[ns] ?? {};
    return (key: string, values?: Record<string, string | number>) => {
      const value = bag[key];
      if (typeof value !== 'string') throw new Error(`missing ${ns}.${key}`);
      let text = value;
      if (values) {
        for (const [name, replacement] of Object.entries(values)) {
          text = text.replaceAll(`{${name}}`, String(replacement));
        }
      }
      return text;
    };
  },
}));

import CostoPage, { generateMetadata as costoMeta } from '@/app/(marketing)/guides/costo-llc-florida/page';
import SsnPage, {
  generateMetadata as ssnMeta,
} from '@/app/(marketing)/guides/llc-florida-sin-seguro-social/page';
import ForeignPage, {
  generateMetadata as foreignMeta,
} from '@/app/(marketing)/guides/llc-florida-para-extranjeros/page';

const NAMESPACES = ['guideLlcCosto', 'guideLlcSinSsn', 'guideLlcExtranjeros'] as const;

const PARTS = tierPriceParts('BASIC', 'LLC', 'FL');
const TOTAL = formatCurrency(PARTS.totalCents);
const SERVICE = formatCurrency(PARTS.serviceCents);
const STATE_FEE = formatCurrency(PARTS.stateFeeCents);

async function resolveAsync(node: ReactNode): Promise<ReactNode> {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    const resolved = await Promise.all(node.map((child) => resolveAsync(child)));
    return resolved;
  }
  if (!isValidElement(node)) return node;
  const type = node.type;
  if (typeof type === 'function' && type.constructor.name === 'AsyncFunction') {
    const rendered = await (type as (props: object) => Promise<ReactNode>)(node.props);
    return resolveAsync(rendered);
  }
  const props = node.props as { children?: ReactNode };
  if (props?.children == null) return node;
  const children = await resolveAsync(props.children);
  return cloneElement(node, {}, children);
}

function nearEin(text: string): string[] {
  const hits: string[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  while (from < lower.length) {
    const at = lower.indexOf('ein', from);
    if (at === -1) break;
    hits.push(lower.slice(Math.max(0, at - 80), at + 80));
    from = at + 3;
  }
  return hits;
}

describe('Spanish buyer-intent guides', () => {
  it('reads the Essential price from the catalog and renders the value block', () => {
    expect(PARTS.totalCents).toBe(19_900);
    expect(PARTS.serviceCents).toBe(7_400);
    expect(PARTS.stateFeeCents).toBe(12_500);
    const html = renderToStaticMarkup(
      createElement(GuideValueCopy, {
        totalLabel: `${TOTAL} todo incluido`,
        split: `Tarifa de servicio ${SERVICE} + tarifa estatal de Florida ${STATE_FEE}`,
        timing: 'Presentación en 1 día hábil',
      }),
    );
    expect(html).toContain('$199 todo incluido');
    expect(html).toContain('Tarifa de servicio $74 + tarifa estatal de Florida $125');
    expect(html).toContain('Presentación en 1 día hábil');

    const block = readFileSync('components/marketing/GuideValueBlock.tsx', 'utf8');
    expect(block).toContain("tierPriceParts('BASIC', 'LLC', 'FL')");
    expect(block).not.toContain('$199');
    expect(block).not.toContain('$74');
    for (const name of NAMESPACES) {
      const blob = JSON.stringify(es[name]);
      expect(blob, name).not.toContain('$199');
      expect(blob, name).not.toContain('$74');
    }
  });

  it('renders each page with the answer first, the price, both CTAs, and FAQ schema', async () => {
    const pages = [
      {
        path: '/es/guides/costo-llc-florida',
        render: CostoPage,
        meta: costoMeta,
        h1: es.guideLlcCosto.title,
        lead: es.guideLlcCosto.description,
      },
      {
        path: '/es/guides/llc-florida-sin-seguro-social',
        render: SsnPage,
        meta: ssnMeta,
        h1: es.guideLlcSinSsn.title,
        lead: es.guideLlcSinSsn.description,
      },
      {
        path: '/es/guides/llc-florida-para-extranjeros',
        render: ForeignPage,
        meta: foreignMeta,
        h1: es.guideLlcExtranjeros.title,
        lead: es.guideLlcExtranjeros.description,
      },
    ];
    for (const page of pages) {
      request.path = page.path;
      const html = renderToStaticMarkup(await resolveAsync(await page.render()));
      const h1At = html.indexOf(`<h1>${page.h1}</h1>`);
      expect(h1At, page.path).toBeGreaterThan(-1);
      const afterH1 = html.slice(h1At);
      const leadAt = afterH1.indexOf(page.lead);
      const valueAt = afterH1.indexOf('data-testid="guide-value"');
      const heroAt = afterH1.indexOf('data-testid="guide-cta-hero"');
      const repeatAt = afterH1.indexOf('data-testid="guide-cta-repeat"');
      expect(leadAt, page.path).toBeGreaterThan(0);
      expect(valueAt, page.path).toBeGreaterThan(leadAt);
      expect(heroAt, page.path).toBeGreaterThan(valueAt);
      expect(repeatAt, page.path).toBeGreaterThan(heroAt);
      expect(html, page.path).toContain('$199 todo incluido');
      expect(html, page.path).toContain('href="/es/start"');
      expect(html, page.path).toContain('"@type":"FAQPage"');
      expect(html, page.path).not.toMatch(/—|–/);

      const meta = await page.meta();
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.description).toBeTruthy();
      expect(meta.alternates?.canonical).toBe(page.path);
      expect(meta.alternates?.languages?.es).toBe(page.path);
    }
  });

  it('pairs the cost guide with the English page and keeps the other two Spanish-only', async () => {
    expect(toSpanishUrl('/guides/florida-llc-cost')).toBe('/es/guides/costo-llc-florida');
    expect(pathForLocale('/guides/florida-llc-cost', 'es')).toBe('/es/guides/costo-llc-florida');
    expect(pathForLocale('/es/guides/costo-llc-florida', 'en')).toBe('/guides/florida-llc-cost');
    expect(pathForLocale('/es/guides/costo-llc-florida?utm_source=ig', 'en')).toBe(
      '/guides/florida-llc-cost?utm_source=ig',
    );
    expect(isSpanishOnlyGuidePath('/es/guides/costo-llc-florida')).toBe(false);
    expect(isSpanishOnlyGuidePath('/es/guides/llc-florida-para-extranjeros')).toBe(true);

    request.path = '/es/guides/costo-llc-florida';
    const costo = await costoMeta();
    expect(costo.alternates?.languages).toEqual({
      en: '/guides/florida-llc-cost',
      es: '/es/guides/costo-llc-florida',
      'x-default': '/guides/florida-llc-cost',
    });

    request.path = '/es/guides/llc-florida-para-extranjeros';
    const foreign = await foreignMeta();
    expect(foreign.alternates?.languages).toEqual({
      es: '/es/guides/llc-florida-para-extranjeros',
      'x-default': '/es/guides/llc-florida-para-extranjeros',
    });
    expect(foreign.alternates?.languages).not.toHaveProperty('en');
  });

  it('lists the new URLs in the sitemap and llms.txt', () => {
    const urls = sitemap().map((item) => item.url);
    expect(urls).toContain('https://launchforma.com/es/guides/costo-llc-florida');
    expect(urls).toContain('https://launchforma.com/es/guides/llc-florida-sin-seguro-social');
    expect(urls).toContain('https://launchforma.com/es/guides/llc-florida-para-extranjeros');
    expect(urls.filter((url) => url.endsWith('/es/guides/costo-llc-florida'))).toHaveLength(1);
    const text = buildLlmsTxt();
    expect(text).toContain('https://launchforma.com/es/guides/costo-llc-florida');
    expect(text).toContain('https://launchforma.com/es/guides/llc-florida-para-extranjeros');
  });

  it('uses the search phrases, tú, and no dashes, and does not call the EIN free', () => {
    const costo = es.guideLlcCosto;
    expect(costo.body).toContain('## Cuánto cuesta abrir una LLC en Florida');
    expect(costo.faq1q).toBe('¿Cuánto cuesta abrir una LLC en Florida?');
    expect(costo.description.startsWith('Abrir una LLC en Florida cuesta $125')).toBe(true);
    expect(costo.body).toContain('1 de enero');
    expect(costo.body).toContain('1 de mayo');
    expect(costo.body).toContain('https://dos.fl.gov/sunbiz/forms/fees/llc-fees/');
    expect(costo.body).toContain('Miami Lakes');
    expect(costo.body).toContain('1 día hábil');

    const ssn = es.guideLlcSinSsn;
    for (const field of [ssn.metaTitle, ssn.title, ssn.metaDescription, ssn.description] as const) {
      expect(field).toContain('sin SSN');
    }
    expect(ssn.description).toContain('El formulario de presentación de Sunbiz no pide un número de Seguro Social.');
    expect(ssn.body).toContain(
      'El EIN lo emite el IRS; si no tienes SSN ni ITIN, se solicita con el [formulario SS-4](https://www.irs.gov/instructions/iss4).',
    );

    const foreign = es.guideLlcExtranjeros;
    expect(foreign.description).toContain('siendo extranjero no residente');
    expect(foreign.body).toContain('quien vive fuera');
    expect(foreign.body).toContain('Actualmente solo formamos empresas en Florida.');
    expect(foreign.body).toContain('puede estar fuera de Florida');
    expect(foreign.body).toContain('suele ser la parte difícil');
    expect(foreign.body).toContain('Consulta a un CPA o a un profesional de impuestos.');

    for (const name of NAMESPACES) {
      const blob = JSON.stringify(es[name]);
      expect(blob, name).not.toMatch(/—|–/);
      expect(blob, name).not.toMatch(/\b(dueño|dueña|ellos|ellas)\b/);
      for (const window of nearEin(blob)) {
        expect(window, name).not.toContain('gratis');
      }
    }

    const home = readFileSync('app/(marketing)/page.tsx', 'utf8');
    const pricing = readFileSync('app/(marketing)/pricing/page.tsx', 'utf8');
    expect(home).toContain('<SpanishSsnGuideLink />');
    expect(pricing).toContain('<SpanishSsnGuideLink />');
    const link = readFileSync('components/marketing/SpanishSsnGuideLink.tsx', 'utf8');
    expect(link).toContain('SPANISH_GUIDE_LLC_SIN_SSN');
    expect(link).toContain("locale !== 'es'");

    const tracking = readFileSync('components/marketing/GuideTracking.tsx', 'utf8');
    expect(tracking).toContain("trackCtaClicked('guide_start'");
    expect(tracking).toContain("trackEvent('scroll_depth'");
    expect(tracking).toContain('location');
    expect(tracking).toContain('source');
    const layout = readFileSync('components/marketing/GuideLayout.tsx', 'utf8');
    expect(layout).toContain("location={topCta.location ?? 'hero'}");
    expect(layout).toContain("location={cta.location ?? 'repeat'}");
  });
});
