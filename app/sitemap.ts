import type { MetadataRoute } from 'next';
import { ALL_MARKETING_STATES } from '@/lib/marketing-states';
import { toSpanishUrl } from '@/lib/locale-paths';
import { retiredStateDestination } from '@/lib/retired-state-redirects';
import { OA_GUIDE_PATH, OA_SITEMAP_LASTMOD } from '@/lib/oa-guide-copy';
import { contentLastModified } from '@/lib/sitemap-lastmod';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

interface PageDef {
  path: string;
  file: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /** Spanish-only article. The English path redirects to /es and stays out of the sitemap. */
  spanishOnly?: boolean;
  /** English-only article. No /es URL and no es hreflang until a translation exists. */
  englishOnly?: boolean;
  /** Emit en, es, and x-default xhtml:link alternates on both URLs. */
  hreflang?: boolean;
}

const STATIC_PAGES: PageDef[] = [
  { path: '/', file: 'app/(marketing)/page.tsx', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/start', file: 'app/start/page.tsx', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/pricing', file: 'app/(marketing)/pricing/page.tsx', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/faq', file: 'app/(marketing)/faq/page.tsx', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/services', file: 'app/(marketing)/services/page.tsx', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', file: 'app/(marketing)/about/page.tsx', changeFrequency: 'monthly', priority: 0.6 },
  {
    path: '/contact',
    file: 'app/(marketing)/contact/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.6,
    hreflang: true,
  },
  {
    path: '/llc-for/stylists-barbers',
    file: 'app/(marketing)/llc-for/stylists-barbers/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    hreflang: true,
  },
  { path: '/file-annual-report', file: 'app/(marketing)/file-annual-report/page.tsx', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/states', file: 'app/(marketing)/states/page.tsx', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/boi-reporting', file: 'app/(marketing)/boi-reporting/page.tsx', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/guides', file: 'app/(marketing)/guides/page.tsx', changeFrequency: 'monthly', priority: 0.6 },
  {
    path: '/guides/how-to-form-an-llc-in-florida',
    file: 'app/(marketing)/guides/how-to-form-an-llc-in-florida/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: '/guides/how-to-form-a-florida-corporation',
    file: 'app/(marketing)/guides/how-to-form-a-florida-corporation/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    hreflang: true,
  },
  {
    path: '/guides/florida-fictitious-name-dba',
    file: 'app/(marketing)/guides/florida-fictitious-name-dba/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    englishOnly: true,
  },
  {
    path: '/guides/florida-annual-report',
    file: 'app/(marketing)/guides/florida-annual-report/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: '/guides/florida-registered-agent',
    file: 'app/(marketing)/guides/florida-registered-agent/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: '/guides/florida-llc-operating-agreement',
    file: 'app/(marketing)/guides/florida-llc-operating-agreement/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    hreflang: true,
  },
  {
    path: '/guides/llc-florida-sin-seguro-social',
    file: 'app/(marketing)/guides/llc-florida-sin-seguro-social/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    spanishOnly: true,
  },
  {
    path: '/guides/licencia-negocio-miami-dade',
    file: 'app/(marketing)/guides/licencia-negocio-miami-dade/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    spanishOnly: true,
  },
  {
    path: '/guides/licencia-negocio-broward',
    file: 'app/(marketing)/guides/licencia-negocio-broward/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    spanishOnly: true,
  },
  {
    path: '/guides/llc-o-negocio-individual-florida',
    file: 'app/(marketing)/guides/llc-o-negocio-individual-florida/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    spanishOnly: true,
  },
  {
    path: '/guides/llc-para-tu-app-florida',
    file: 'app/(marketing)/guides/llc-para-tu-app-florida/page.tsx',
    changeFrequency: 'monthly',
    priority: 0.7,
    spanishOnly: true,
  },
  { path: '/terms', file: 'app/(legal)/terms/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', file: 'app/(legal)/privacy/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  {
    path: '/privacy-choices',
    file: 'app/(legal)/privacy-choices/page.tsx',
    changeFrequency: 'yearly',
    priority: 0.2,
  },
  { path: '/disclaimer', file: 'app/(legal)/disclaimer/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refund-policy', file: 'app/(legal)/refund-policy/page.tsx', changeFrequency: 'yearly', priority: 0.4 },
];

function absoluteUrl(path: string): string {
  if (path === '/') return `${BASE_URL}/`;
  return `${BASE_URL}${path}`;
}

function toEntry(page: PageDef, spanish: boolean): MetadataRoute.Sitemap[number] {
  const path = spanish ? toSpanishUrl(page.path) : page.path;
  const entry: MetadataRoute.Sitemap[number] = {
    url: absoluteUrl(path),
    lastModified:
      page.path === OA_GUIDE_PATH
        ? new Date(OA_SITEMAP_LASTMOD)
        : contentLastModified(page.file),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  };
  if (page.hreflang && !page.spanishOnly && !page.englishOnly) {
    const en = absoluteUrl(page.path);
    const es = absoluteUrl(toSpanishUrl(page.path));
    entry.alternates = {
      languages: {
        en,
        es,
        'x-default': en,
      },
    };
  }
  return entry;
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Every indexable /states page. Coming-soon slugs are noindex, and
  // Delaware / Wyoming URLs are excluded (they 308 to Florida). Each
  // English URL is mirrored under /es, except englishOnly guides.
  const statePages: PageDef[] = ALL_MARKETING_STATES.filter(
    (s) => s.availability === 'active',
  ).map((s) => ({
    path: `/states/${s.slug}`,
    file: 'app/(marketing)/states/[slug]/page.tsx',
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));

  const pages = [...STATIC_PAGES, ...statePages].filter(
    (page) => retiredStateDestination(page.path) == null,
  );
  return [
    ...pages.filter((page) => !page.spanishOnly).map((page) => toEntry(page, false)),
    ...pages.filter((page) => !page.englishOnly).map((page) => toEntry(page, true)),
  ];
}
