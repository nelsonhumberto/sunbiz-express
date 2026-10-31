import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { buildLlmsTxt } from '@/lib/llms';
import { contentLastModified } from '@/lib/sitemap-lastmod';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { FLORIDA } from '@/lib/marketing-states';
import { tierPackagePriceCents, type TierSlug } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';
import type { EntityType } from '@/lib/formation-states';

const PAGE = 'app/(marketing)/guides/florida-llc-cost/page.tsx';
const URL = 'https://launchforma.com/guides/florida-llc-cost';

const TITLE = 'Florida LLC Cost 2026: $125 State Fee and Yearly Costs';
const DESCRIPTION =
  'Forming a Florida LLC costs $125 in state fees, and the annual report is $138.75 each year. See every Sunbiz fee and the costs owners forget.';

const INTERNAL_LINKS: { href: string; file: string }[] = [
  {
    href: '/guides/florida-registered-agent',
    file: 'app/(marketing)/guides/florida-registered-agent/page.tsx',
  },
  {
    href: '/guides/how-to-form-a-florida-corporation',
    file: 'app/(marketing)/guides/how-to-form-a-florida-corporation/page.tsx',
  },
  { href: '/pricing', file: 'app/(marketing)/pricing/page.tsx' },
  {
    href: '/guides/florida-annual-report',
    file: 'app/(marketing)/guides/florida-annual-report/page.tsx',
  },
  {
    href: '/guides/florida-llc-operating-agreement',
    file: 'app/(marketing)/guides/florida-llc-operating-agreement/page.tsx',
  },
  { href: '/start', file: 'app/start/page.tsx' },
];

const SOURCE_URLS = [
  'https://dos.fl.gov/sunbiz/forms/fees/llc-fees/',
  'https://dos.fl.gov/sunbiz/forms/fees/corporate-fees/',
  'https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/',
  'https://dos.fl.gov/sunbiz/start-business/efile/fl-fictitious-name-registration/',
  'https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number',
  'https://www.fincen.gov/boi',
];

describe('Florida LLC cost guide', () => {
  const page = readFileSync(PAGE, 'utf8');

  it('keeps the spec title, description, H1, and English-only metadata', () => {
    expect(TITLE).toHaveLength(54);
    expect(DESCRIPTION).toHaveLength(141);
    expect(page).toContain(`const TITLE = '${TITLE}'`);
    expect(page).toContain(DESCRIPTION);
    expect(page).toContain(
      "const H1 = 'How Much Does It Cost to Start an LLC in Florida? (2026 State Fees)'",
    );
    expect(page).toContain('dateModified={DATE_MODIFIED}');
    expect(page).toContain("const DATE_MODIFIED = '2026-10-26'");
    expect(page).toContain('faqPageJsonLd(FAQ)');
    expect(page).toContain('buildLocaleAlternates(PATH)');
    expect(page).toContain('permanentRedirect(toSpanishUrl(PATH))');
    expect(page).not.toContain('englishOnlyAlternates');
    expect(page).toContain('title: { absolute: TITLE }');
    expect(page).not.toContain('withLocaleMeta');
    expect(page).toContain('General information only, not legal or tax advice.');
    expect(page).toContain('inLanguage="en"');
  });

  it('keeps the state fees, source links, and the /start CTA', () => {
    expect(page).toContain('**$125**');
    expect(page).toContain('**$138.75**');
    expect(page).toContain('$538.75');
    expect(page).toContain('$100.00');
    expect(page).toContain('$25.00');
    expect(page).toContain('$70.00 ($35 + $35)');
    expect(page).toContain('$150.00');
    expect(page).toContain('| Name reservation | $25.00 | Optional |');
    expect(page).toContain(
      "LaunchForma files Florida LLCs online from our Miami Lakes office. Our packages include the state filing fee, so there's no separate state fee at checkout, and we submit your filing within 1 business day. Approval timing is up to the state.",
    );
    const about = page.indexOf('LaunchForma files Florida LLCs online from our Miami Lakes office.');
    const pricingLink = page.indexOf('[https://launchforma.com/pricing](/pricing)');
    expect(pricingLink).toBeGreaterThan(about);
    expect(page.slice(about, pricingLink)).not.toMatch(/—|–/);
    expect(page).toContain(
      "[FinCEN's final rule permanently removed the beneficial ownership reporting requirement for companies formed in the United States.](https://www.fincen.gov/boi)",
    );
    expect(page).not.toContain('/boi-reporting');
    expect(page).not.toContain('August 2026');
    expect(page).toContain('Miami Lakes');
    expect(page).toContain('within 1 business day');
    expect(page).toContain('href="/start"');
    expect(page).toContain('Start your Florida LLC online, no account needed');
    for (const url of SOURCE_URLS) {
      expect(page, url).toContain(url);
    }
  });

  it('does not hard-code LaunchForma package prices or use dashes', () => {
    const tiers: TierSlug[] = ['BASIC', 'STANDARD', 'PREMIUM'];
    const entities: EntityType[] = ['LLC', 'CORP'];
    for (const tier of tiers) {
      for (const entity of entities) {
        const price = formatCurrency(tierPackagePriceCents(tier, entity, 'FL'));
        expect(page, price).not.toContain(price);
      }
    }
    expect(page).not.toContain('plus state fees');
    expect(page).not.toContain('Florida-only');
    expect(page).not.toMatch(/—|–/);
    const index = readFileSync('app/(marketing)/guides/page.tsx', 'utf8');
    expect(index).toContain("slug: 'florida-llc-cost'");
    expect(index).toContain('readingMinutes: 5');
    expect(index).not.toMatch(/florida-llc-cost[\s\S]{0,500}—|florida-llc-cost[\s\S]{0,500}–/);
  });

  it('links only to routes that exist', () => {
    for (const link of INTERNAL_LINKS) {
      expect(page, link.href).toContain(link.href);
      expect(existsSync(link.file), link.href).toBe(true);
    }
  });

  it('adds the fees-section link on the Florida LLC guide', () => {
    const llc = readFileSync(
      'app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx',
      'utf8',
    );
    expect(llc).toContain('State fees are listed in');
    expect(llc).toContain('href="/guides/florida-llc-cost"');
    expect(llc).toContain('How Much Does It Cost to Start an LLC in Florida? (2026 State Fees)');
    expect(llc).not.toMatch(/—|–/);
  });

  it('links from English pricing and the English cost FAQ', () => {
    const pricing = readFileSync('app/(marketing)/pricing/page.tsx', 'utf8');
    expect(pricing).toContain("href: '/guides/florida-llc-cost'");
    expect(pricing).toContain("label: 'What the state charges'");
    expect(pricing).toContain("locale === 'en'");

    const faq = getMarketingFaq(FLORIDA, 'en');
    const cost = faq.find((item) => item.id === 'florida-llc-cost');
    expect(cost?.q).toBe('How much does it cost to start an LLC in Florida?');
    expect(cost?.a).toContain('$125');
    expect(cost?.a).toContain('$138.75');
    expect(cost?.link).toEqual({
      href: '/guides/florida-llc-cost',
      label: 'https://launchforma.com/guides/florida-llc-cost',
    });
    expect(cost?.a.endsWith(cost.link?.label ?? '')).toBe(true);
    const spanish = getMarketingFaq(FLORIDA, 'es');
    expect(spanish.some((item) => item.link?.href === '/guides/florida-llc-cost')).toBe(false);
    expect(readFileSync('components/marketing/FAQSection.tsx', 'utf8')).toContain('href={link.href}');
  });

  it('lists the English URL and the Spanish cost twin in the sitemap and llms.txt', () => {
    const entry = sitemap().find((item) => item.url === URL);
    const spanishUrl = 'https://launchforma.com/es/guides/costo-llc-florida';
    expect(entry?.lastModified).toEqual(contentLastModified(PAGE));
    expect(entry?.alternates?.languages).toEqual({
      en: URL,
      es: spanishUrl,
      'x-default': URL,
    });
    const urls = sitemap().map((item) => item.url);
    expect(urls).toContain(URL);
    expect(urls).toContain(spanishUrl);
    expect(urls).not.toContain('https://launchforma.com/es/guides/florida-llc-cost');
    const spanish = sitemap().find((item) => item.url === spanishUrl);
    expect(spanish?.alternates?.languages).toEqual(entry?.alternates?.languages);

    const text = buildLlmsTxt();
    expect(text).toContain(
      '- [Florida LLC Cost](https://launchforma.com/guides/florida-llc-cost): State fees to form a Florida LLC ($125 = $100 filing + $25 registered agent), $138.75 annual report ($538.75 after May 1), and commonly missed costs.',
    );
    expect(text).not.toContain('/es/guides/florida-llc-cost');
  });
});
