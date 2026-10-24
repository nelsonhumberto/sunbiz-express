import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { contentLastModified } from '@/lib/sitemap-lastmod';
import { buildLlmsTxt } from '@/lib/llms';
import snapshot from '@/data/sitemap-lastmod.json';

describe('sitemap lastModified', () => {
  it('keeps historical dates in the snapshot and does not use one build clock', () => {
    const dates = snapshot as Record<string, string>;
    expect(dates['app/(legal)/terms/page.tsx']).toContain('2026-10-17');
    expect(dates['app/(marketing)/guides/wyoming-llc-vs-delaware-corp/page.tsx']).toContain(
      '2026-10-13',
    );
    const terms = contentLastModified('app/(legal)/terms/page.tsx');
    const wyomingGuide = contentLastModified(
      'app/(marketing)/guides/wyoming-llc-vs-delaware-corp/page.tsx',
    );
    expect(Number.isNaN(terms.getTime())).toBe(false);
    expect(Number.isNaN(wyomingGuide.getTime())).toBe(false);
    expect(terms.toISOString()).not.toContain('2026-05-27');
    expect(wyomingGuide.toISOString()).not.toContain('2026-05-27');
  });

  it('lists Florida, every active state page, and the new guides', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain('https://launchforma.com/states/florida');
    expect(urls).not.toContain('https://launchforma.com/states/delaware');
    expect(urls).not.toContain('https://launchforma.com/states/wyoming');
    expect(urls).not.toContain('https://launchforma.com/es/states/delaware');
    expect(urls).not.toContain('https://launchforma.com/es/states/wyoming');
    expect(urls.some((url) => /delaware|wyoming/i.test(url))).toBe(false);
    expect(urls).toContain('https://launchforma.com/guides/how-to-form-an-llc-in-florida');
    expect(urls).toContain('https://launchforma.com/guides/florida-annual-report');
    expect(urls).toContain('https://launchforma.com/guides/florida-registered-agent');
    expect(urls.some((url) => url.includes('/states/texas'))).toBe(false);

    const stamps = sitemap().map((entry) =>
      new Date(entry.lastModified as Date).toISOString(),
    );
    expect(new Set(stamps).size).toBeGreaterThan(1);
  });
});

describe('llms.txt', () => {
  it('lists the new guides and the Florida state page', () => {
    const text = buildLlmsTxt();
    expect(text).toContain('/guides/how-to-form-an-llc-in-florida');
    expect(text).toContain('/guides/florida-annual-report');
    expect(text).toContain('/guides/florida-registered-agent');
    expect(text).toContain('/states/florida');
    expect(text).toContain('/guides/boi-filing-2026');
    expect(text.toLowerCase()).not.toContain('legalzoom');
  });
});
