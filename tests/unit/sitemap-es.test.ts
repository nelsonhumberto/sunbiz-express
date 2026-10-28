import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { buildLlmsTxt } from '@/lib/llms';

const ES_PATHS = [
  '/es',
  '/es/start',
  '/es/pricing',
  '/es/faq',
  '/es/services',
  '/es/about',
  '/es/contacto',
  '/es/llc-para/estilistas-barberos',
  '/es/file-annual-report',
  '/es/states',
  '/es/states/florida',
  '/es/boi-reporting',
  '/es/guides',
  '/es/guides/how-to-form-an-llc-in-florida',
  '/es/guides/how-to-form-a-florida-corporation',
  '/es/guides/florida-annual-report',
  '/es/guides/florida-registered-agent',
  '/es/guides/florida-llc-operating-agreement',
  '/es/guides/llc-florida-sin-seguro-social',
  '/es/guides/licencia-negocio-miami-dade',
  '/es/guides/licencia-negocio-broward',
  '/es/guides/llc-o-negocio-individual-florida',
  '/es/guides/llc-para-tu-app-florida',
  '/es/terms',
  '/es/privacy',
  '/es/privacy-choices',
  '/es/disclaimer',
  '/es/refund-policy',
];

describe('Spanish sitemap URLs', () => {
  it('lists every Spanish URL and does not send /es at the English homepage', () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of ES_PATHS) {
      expect(urls).toContain(`https://launchforma.com${path}`);
    }
    expect(urls).not.toContain('https://launchforma.com/es/');
    for (const url of urls) {
      expect(url.toLowerCase()).not.toMatch(/delaware|wyoming/);
    }
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
    expect(text).not.toContain('https://launchforma.com/es/states/delaware');
    expect(text).not.toContain('https://launchforma.com/es/states/wyoming');
    expect(text).not.toContain('/guides/wyoming-llc-vs-delaware-corp');
    expect(text).toContain('https://launchforma.com/es/guides/florida-llc-operating-agreement');
    expect(text).toContain('https://launchforma.com/es/guides/how-to-form-an-llc-in-florida');
    expect(text).toContain('https://launchforma.com/es/guides/how-to-form-a-florida-corporation');
    expect(text).toContain('https://launchforma.com/guides/how-to-form-a-florida-corporation');
    expect(text).toContain('https://launchforma.com/es/guides/florida-annual-report');
    expect(text).toContain('https://launchforma.com/es/guides/florida-registered-agent');
    expect(text).toContain('https://launchforma.com/es/guides/llc-florida-sin-seguro-social');
    expect(text).toContain('https://launchforma.com/es/guides/licencia-negocio-miami-dade');
    expect(text).toContain('https://launchforma.com/es/guides/licencia-negocio-broward');
    expect(text).toContain('https://launchforma.com/es/guides/llc-o-negocio-individual-florida');
    expect(text).toContain('https://launchforma.com/es/guides/llc-para-tu-app-florida');
    expect(text).toContain('11 de agosto de 2026');
    expect(text).toContain('https://launchforma.com/es/states/florida');
    expect(text).toContain('Traducción en borrador');
  });
});
