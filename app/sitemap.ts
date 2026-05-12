import type { MetadataRoute } from 'next';
import { ALL_MARKETING_STATES } from '@/lib/marketing-states';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/file-annual-report`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
  ];

  const statePages: MetadataRoute.Sitemap = ALL_MARKETING_STATES
    .filter((s) => s.availability === 'active' && s.code !== 'FL')
    .map((s) => ({
      url: `${BASE_URL}/states/${s.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }));

  return [...staticPages, ...statePages];
}
