import type { MetadataRoute } from 'next';
import { ALL_MARKETING_STATES } from '@/lib/marketing-states';
import { toSpanishUrl } from '@/lib/locale-paths';
import { contentLastModified } from '@/lib/sitemap-lastmod';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

type ChangeFrequency = 'weekly' | 'monthly' | 'yearly';

interface PageDef {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

const STATIC_PAGES: PageDef[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/start', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/faq', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/services', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/file-annual-report', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/states', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/boi-reporting', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/guides', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/guides/wyoming-llc-vs-delaware-corp', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/guides/florida-llc-operating-agreement', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/disclaimer', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refund-policy', changeFrequency: 'yearly', priority: 0.4 },
];

function absoluteUrl(path: string): string {
  if (path === '/') return `${BASE_URL}/`;
  return `${BASE_URL}${path}`;
}

function entry(page: PageDef, spanish: boolean): MetadataRoute.Sitemap[number] {
  const path = spanish ? toSpanishUrl(page.path) : page.path;
  return {
    url: absoluteUrl(path),
    lastModified: contentLastModified(path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const statePages: PageDef[] = ALL_MARKETING_STATES.filter(
    (s) => s.availability === 'active' && s.code !== 'FL',
  ).map((s) => ({
    path: `/states/${s.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));

  const pages = [...STATIC_PAGES, ...statePages];
  return [...pages.map((page) => entry(page, false)), ...pages.map((page) => entry(page, true))];
}
