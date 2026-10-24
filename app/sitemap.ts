import type { MetadataRoute } from 'next';
import { ALL_MARKETING_STATES } from '@/lib/marketing-states';
import { toSpanishUrl } from '@/lib/locale-paths';
import { retiredStateDestination } from '@/lib/retired-state-redirects';
import { contentLastModified } from '@/lib/sitemap-lastmod';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

interface PageDef {
  path: string;
  file: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

const STATIC_PAGES: PageDef[] = [
  { path: '/', file: 'app/(marketing)/page.tsx', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/start', file: 'app/start/page.tsx', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/pricing', file: 'app/(marketing)/pricing/page.tsx', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/faq', file: 'app/(marketing)/faq/page.tsx', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/services', file: 'app/(marketing)/services/page.tsx', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', file: 'app/(marketing)/about/page.tsx', changeFrequency: 'monthly', priority: 0.6 },
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
  },
  { path: '/terms', file: 'app/(legal)/terms/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', file: 'app/(legal)/privacy/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/disclaimer', file: 'app/(legal)/disclaimer/page.tsx', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refund-policy', file: 'app/(legal)/refund-policy/page.tsx', changeFrequency: 'yearly', priority: 0.4 },
];

function absoluteUrl(path: string): string {
  if (path === '/') return `${BASE_URL}/`;
  return `${BASE_URL}${path}`;
}

function toEntry(page: PageDef, spanish: boolean): MetadataRoute.Sitemap[number] {
  const path = spanish ? toSpanishUrl(page.path) : page.path;
  return {
    url: absoluteUrl(path),
    lastModified: contentLastModified(page.file),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Every indexable /states page. Coming-soon slugs are noindex, and
  // Delaware / Wyoming URLs are excluded (they 308 to Florida). Each
  // English URL is mirrored under /es.
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
  return [...pages.map((page) => toEntry(page, false)), ...pages.map((page) => toEntry(page, true))];
}
