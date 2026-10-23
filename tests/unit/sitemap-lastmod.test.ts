import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { contentLastModified } from '@/lib/sitemap-lastmod';
import { buildLlmsTxt } from '@/lib/llms';

describe('sitemap lastModified', () => {
  it('uses content dates instead of a single build timestamp', () => {
    const terms = contentLastModified('app/(legal)/terms/page.tsx');
    const wyomingGuide = contentLastModified(
      'app/(marketing)/guides/wyoming-llc-vs-delaware-corp/page.tsx',
    );
    expect(terms.toISOString()).toContain('2026-10-17');
    expect(wyomingGuide.toISOString()).toContain('2026-10-13');
    expect(terms.getTime()).not.toBe(wyomingGuide.getTime());
  });

  it('lists Florida, every active state page, and the new guides', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toContain('https://launchforma.com/states/florida');
    expect(urls).toContain('https://launchforma.com/states/delaware');
    expect(urls).toContain('https://launchforma.com/states/wyoming');
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
