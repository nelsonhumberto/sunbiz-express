import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { contentLastModified } from '@/lib/sitemap-lastmod';
import { buildLlmsTxt } from '@/lib/llms';

const ES_PATHS = [
  '/es',
  '/es/start',
  '/es/pricing',
  '/es/faq',
  '/es/services',
  '/es/about',
  '/es/file-annual-report',
  '/es/states',
  '/es/states/delaware',
  '/es/states/wyoming',
  '/es/boi-reporting',
  '/es/guides',
  '/es/guides/wyoming-llc-vs-delaware-corp',
  '/es/guides/florida-llc-operating-agreement',
  '/es/terms',
  '/es/privacy',
  '/es/disclaimer',
  '/es/refund-policy',
];

describe('sitemap lastModified', () => {
  it('keeps distinct git-sourced dates from the committed map', () => {
    const terms = contentLastModified('/terms');
    const wyomingGuide = contentLastModified('/guides/wyoming-llc-vs-delaware-corp');
    const spanishServices = contentLastModified('/es/services');
    expect(terms.toISOString()).toContain('2026-10-17');
    expect(wyomingGuide.toISOString()).toContain('2026-10-13');
    expect(spanishServices.toISOString()).toContain('2026-10-23');
    expect(terms.getTime()).not.toBe(wyomingGuide.getTime());
  });

  it('lists every Spanish URL and does not send /es at the English homepage', () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of ES_PATHS) {
      expect(urls).toContain(`https://launchforma.com${path}`);
    }
    expect(urls).not.toContain('https://launchforma.com/es/');
    const spanish = urls.filter((url) => new URL(url).pathname === '/es' || new URL(url).pathname.startsWith('/es/'));
    expect(spanish.length).toBe(ES_PATHS.length);
    for (const url of spanish) {
      expect(new URL(url).pathname).not.toBe('/');
    }
    const stamps = sitemap().map((entry) => new Date(entry.lastModified as Date).toISOString());
    expect(new Set(stamps).size).toBeGreaterThan(1);
  });
});

describe('llms.txt Spanish URLs', () => {
  it('lists the Spanish pages and marks legal copy as a draft', () => {
    const text = buildLlmsTxt();
    expect(text).toContain('https://launchforma.com/es/services');
    expect(text).toContain('https://launchforma.com/es/states/delaware');
    expect(text).toContain('https://launchforma.com/es/guides/florida-llc-operating-agreement');
    expect(text).toContain('Traducción en borrador');
    expect(text).not.toContain('https://launchforma.com/guides/how-to-form-an-llc-in-florida');
  });
});
