import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { buildLlmsTxt } from '@/lib/llms';
import { contentLastModified } from '@/lib/sitemap-lastmod';
import { TIER_BY_SLUG, tierPackagePriceCents } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

const PAGE = 'app/(marketing)/guides/florida-fictitious-name-dba/page.tsx';
const URL = 'https://launchforma.com/guides/florida-fictitious-name-dba';

const INTERNAL_LINKS: { href: string; file: string }[] = [
  {
    href: '/guides/how-to-form-an-llc-in-florida',
    file: 'app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx',
  },
  {
    href: '/guides/how-to-form-a-florida-corporation',
    file: 'app/(marketing)/guides/how-to-form-a-florida-corporation/page.tsx',
  },
  {
    href: '/guides/florida-llc-operating-agreement',
    file: 'app/(marketing)/guides/florida-llc-operating-agreement/page.tsx',
  },
  {
    href: '/guides/florida-annual-report',
    file: 'app/(marketing)/guides/florida-annual-report/page.tsx',
  },
  {
    href: '/guides/florida-registered-agent',
    file: 'app/(marketing)/guides/florida-registered-agent/page.tsx',
  },
  {
    href: '/es/guides/licencia-negocio-miami-dade',
    file: 'app/(marketing)/guides/licencia-negocio-miami-dade/page.tsx',
  },
  {
    href: '/es/guides/licencia-negocio-broward',
    file: 'app/(marketing)/guides/licencia-negocio-broward/page.tsx',
  },
  { href: '/start', file: 'app/start/page.tsx' },
];

describe('Florida fictitious name guide', () => {
  const page = readFileSync(PAGE, 'utf8');

  it('keeps the spec title, description, and H1 lengths', () => {
    const title = 'Florida Fictitious Name (DBA): How to Register in 2026';
    const description =
      'How to register a fictitious name (DBA) in Florida: who needs one, the $50 Sunbiz fee, the newspaper ad, 5-year renewal and how to cancel it.';
    expect(title).toHaveLength(54);
    expect(description).toHaveLength(141);
    expect(page).toContain(`const TITLE = '${title}'`);
    expect(page).toContain(description);
    expect(page).toContain("const H1 = 'Florida Fictitious Name (DBA): How to Register One'");
    expect(page).toContain('dateModified={DATE_MODIFIED}');
    expect(page).toContain("const DATE_MODIFIED = '2026-10-25'");
    expect(page).toContain('faqPageJsonLd(FAQ)');
    expect(page).toContain('englishOnlyAlternates(PATH)');
    expect(page).not.toContain('withLocaleMeta');
    expect(page).not.toContain('permanentRedirect');
    expect(page).toContain("const ES_REINSTATE_GUIDE = '/es/guides/how-to-reinstate-a-florida-llc'");
    expect(page).toContain('bodyForLocale(locale)');
    expect(page).toContain('General information, not legal or tax advice.');
  });

  it('does not use em dashes or en dashes', () => {
    expect(page).not.toMatch(/—|–/);
    const index = readFileSync('app/(marketing)/guides/page.tsx', 'utf8');
    expect(index).toContain("slug: 'florida-fictitious-name-dba'");
    expect(index).not.toMatch(/florida-fictitious-name-dba[\s\S]{0,400}—|florida-fictitious-name-dba[\s\S]{0,400}–/);
  });

  it('matches Florida LLC package prices from lib/pricing.ts', () => {
    expect(TIER_BY_SLUG.BASIC.name).toBe('Essential');
    expect(TIER_BY_SLUG.STANDARD.name).toBe('Popular');
    expect(formatCurrency(tierPackagePriceCents('BASIC', 'LLC', 'FL'))).toBe('$149');
    expect(formatCurrency(tierPackagePriceCents('STANDARD', 'LLC', 'FL'))).toBe('$279');
    expect(page).toContain(
      'LaunchForma is an online formation service for Florida businesses, run by a husband and wife team and helping business owners since 2015. Florida LLC packages start at $149 with the state filing fee included, and the Popular package ($279) includes a custom Operating Agreement.',
    );
  });

  it('links only to routes that exist', () => {
    for (const link of INTERNAL_LINKS) {
      expect(page, link.href).toContain(link.href);
      expect(existsSync(link.file), link.href).toBe(true);
    }
  });

  it('adds the reverse link on the Florida LLC guide', () => {
    const llc = readFileSync('app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx', 'utf8');
    expect(llc).toContain('Selling under a brand name? See');
    expect(llc).toContain('href="/guides/florida-fictitious-name-dba"');
    expect(llc).toContain('Florida fictitious names');
    expect(llc).not.toMatch(/—|–/);
  });

  it('lists the English URL in the sitemap and llms.txt, with no Spanish alternate', () => {
    const entry = sitemap().find((item) => item.url === URL);
    expect(entry?.lastModified).toEqual(contentLastModified(PAGE));
    expect(entry?.alternates).toBeUndefined();
    const urls = sitemap().map((item) => item.url);
    expect(urls).toContain(URL);
    expect(urls).not.toContain('https://launchforma.com/es/guides/florida-fictitious-name-dba');

    const text = buildLlmsTxt();
    expect(text).toContain(
      '- [Florida Fictitious Name (DBA)](https://launchforma.com/guides/florida-fictitious-name-dba): Who needs a DBA, the $50 Sunbiz fee, newspaper ad, 5-year renewal, cancellation.',
    );
    expect(text).not.toContain('/es/guides/florida-fictitious-name-dba');
  });
});
