import { cloneElement, createElement, isValidElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { NONRESIDENT_ES, WITHOUT_SSN_ES } from '@/lib/buyer-guide-hreflang';
import { FLORIDA_ONLY_NOTE } from '@/lib/formation-states';
import { buildLlmsTxt } from '@/lib/llms';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

vi.mock('next/headers', () => ({
  headers: () => ({ get: () => null }),
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
  getLocale: async () => 'en',
  getTranslations: async (ns: string) => {
    const messages = JSON.parse(readFileSync('messages/en.json', 'utf8')) as Record<
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

import CheapestPage, {
  generateMetadata as cheapestMeta,
} from '@/app/(marketing)/guides/cheapest-way-to-form-florida-llc/page';
import NonResidentPage, {
  generateMetadata as nonResidentMeta,
} from '@/app/(marketing)/guides/florida-llc-non-resident/page';
import WithoutSsnPage, {
  generateMetadata as withoutSsnMeta,
} from '@/app/(marketing)/guides/florida-llc-without-ssn/page';
import HowLongPage, {
  generateMetadata as howLongMeta,
} from '@/app/(marketing)/guides/how-long-to-form-florida-llc/page';

const PAGES = [
  {
    path: '/guides/cheapest-way-to-form-florida-llc',
    render: CheapestPage,
    meta: cheapestMeta,
    h1: 'Cheapest way to form an LLC in Florida',
    leadStart: 'The cheapest way to form an LLC in Florida',
  },
  {
    path: '/guides/florida-llc-non-resident',
    render: NonResidentPage,
    meta: nonResidentMeta,
    h1: 'Florida LLC for non resident',
    leadStart: 'You can form a Florida LLC as a non resident',
  },
  {
    path: '/guides/florida-llc-without-ssn',
    render: WithoutSsnPage,
    meta: withoutSsnMeta,
    h1: 'Florida LLC without SSN',
    leadStart: 'Sunbiz has no SSN field',
  },
  {
    path: '/guides/how-long-to-form-florida-llc',
    render: HowLongPage,
    meta: howLongMeta,
    h1: 'How long does it take to form an LLC in Florida',
    leadStart: 'Sunbiz processes Florida LLC filings in the order received',
  },
] as const;

async function resolveAsync(node: ReactNode): Promise<ReactNode> {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return Promise.all(node.map((child) => resolveAsync(child)));
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

describe('English buyer-intent guides', () => {
  it('renders the catalog price, the answer, both CTAs, and FAQ schema', async () => {
    const parts = tierPriceParts('BASIC', 'LLC', 'FL');
    expect(formatCurrency(parts.totalCents)).toBe('$199');
    expect(readFileSync('components/marketing/GuidePriceBlock.tsx', 'utf8')).toContain(
      "tierPriceParts('BASIC', 'LLC', 'FL')",
    );

    for (const page of PAGES) {
      const html = renderToStaticMarkup(await resolveAsync(await page.render()));
      const h1At = html.indexOf(`<h1>${page.h1}</h1>`);
      expect(h1At, page.path).toBeGreaterThan(-1);
      const afterH1 = html.slice(h1At);
      const leadAt = afterH1.indexOf(page.leadStart);
      const valueAt = afterH1.indexOf('data-testid="guide-value"');
      const heroAt = afterH1.indexOf('data-testid="guide-cta-hero"');
      const repeatAt = afterH1.indexOf('data-testid="guide-cta-repeat"');
      expect(leadAt, page.path).toBeGreaterThan(0);
      expect(valueAt, page.path).toBeGreaterThan(leadAt);
      expect(heroAt, page.path).toBeGreaterThan(valueAt);
      expect(repeatAt, page.path).toBeGreaterThan(heroAt);
      expect(html, page.path).toContain('$199 all-in');
      expect(html, page.path).toContain('Service fee $74 + Florida state fee $125');
      expect(html, page.path).toContain('Filing within 1 business day');
      expect(html, page.path).toContain('href="/start"');
      expect(html, page.path).toContain('"@type":"FAQPage"');
      expect(html, page.path).not.toMatch(/—|–/);
      if (page.path.endsWith('how-long-to-form-florida-llc')) {
        expect(html).toContain('https://dos.fl.gov/sunbiz/document-processing-dates/');
        expect(html).toContain('in the order received');
      }
      if (page.path.endsWith('florida-llc-non-resident')) {
        expect(html).toContain('We currently form Florida companies only.');
      }
      for (const window of nearEin(html)) {
        expect(window, page.path).not.toContain('free');
      }

      const meta = await page.meta();
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.description).toContain(page.leadStart);
      expect(meta.alternates?.canonical).toBe(page.path);
      expect(String(meta.title)).not.toMatch(/—|–/);
    }
  });

  it('pairs the SSN and non resident guides with their Spanish URLs and keeps the others English-only', async () => {
    const ssn = await withoutSsnMeta();
    expect(ssn.alternates?.languages).toEqual({
      en: '/guides/florida-llc-without-ssn',
      es: WITHOUT_SSN_ES,
      'x-default': '/guides/florida-llc-without-ssn',
    });
    const nonResident = await nonResidentMeta();
    expect(nonResident.alternates?.languages).toEqual({
      en: '/guides/florida-llc-non-resident',
      es: NONRESIDENT_ES,
      'x-default': '/guides/florida-llc-non-resident',
    });
    const cheapest = await cheapestMeta();
    expect(cheapest.alternates?.languages).not.toHaveProperty('es');
    const howLong = await howLongMeta();
    expect(howLong.alternates?.languages).not.toHaveProperty('es');
  });

  it('lists the English URLs in the sitemap without inventing same-slug Spanish copies', () => {
    const urls = sitemap().map((item) => item.url);
    const base = 'https://launchforma.com';
    for (const path of [
      '/guides/cheapest-way-to-form-florida-llc',
      '/guides/florida-llc-non-resident',
      '/guides/florida-llc-without-ssn',
      '/guides/how-long-to-form-florida-llc',
    ]) {
      expect(urls).toContain(`${base}${path}`);
      expect(urls).not.toContain(`${base}/es${path}`);
    }
    expect(urls.filter((url) => url === `${base}${WITHOUT_SSN_ES}`)).toHaveLength(1);
    const ssn = sitemap().find((item) => item.url === `${base}/guides/florida-llc-without-ssn`);
    expect(ssn?.alternates?.languages?.es).toBe(`${base}${WITHOUT_SSN_ES}`);
    const nonResident = sitemap().find(
      (item) => item.url === `${base}/guides/florida-llc-non-resident`,
    );
    expect(nonResident?.alternates?.languages?.es).toBe(`${base}${NONRESIDENT_ES}`);
    expect(urls).not.toContain(`${base}${NONRESIDENT_ES}`);

    const text = buildLlmsTxt();
    expect(text).toContain('/guides/cheapest-way-to-form-florida-llc');
    expect(text).toContain('/guides/how-long-to-form-florida-llc');
  });

  it('keeps the required sentences and does not hard-code the package price', () => {
    const nonResident = readFileSync(
      'app/(marketing)/guides/florida-llc-non-resident/page.tsx',
      'utf8',
    );
    const withoutSsn = readFileSync(
      'app/(marketing)/guides/florida-llc-without-ssn/page.tsx',
      'utf8',
    );
    const howLong = readFileSync(
      'app/(marketing)/guides/how-long-to-form-florida-llc/page.tsx',
      'utf8',
    );
    const cheapest = readFileSync(
      'app/(marketing)/guides/cheapest-way-to-form-florida-llc/page.tsx',
      'utf8',
    );
    expect(nonResident).toContain('FLORIDA_ONLY_NOTE.en');
    expect(FLORIDA_ONLY_NOTE.en).toBe('We currently form Florida companies only.');
    expect(withoutSsn).toContain('Sunbiz has no SSN field');
    expect(howLong).toContain('fees.processingDates');
    expect(readFileSync('lib/florida-llc-guide-fees.ts', 'utf8')).toContain(
      'documentProcessingDates',
    );
    expect(howLong).toContain('in the order received');
    expect(cheapest).toContain('floridaLlcGuideFees');
    for (const file of [nonResident, withoutSsn, howLong, cheapest]) {
      expect(file).not.toMatch(/—|–/);
      expect(file).not.toContain('$199');
      expect(file).not.toContain('$74');
    }
    const index = readFileSync('app/(marketing)/guides/page.tsx', 'utf8');
    expect(index).toContain("slug: 'cheapest-way-to-form-florida-llc'");
    expect(index).toContain("slug: 'florida-llc-without-ssn'");
  });
});
