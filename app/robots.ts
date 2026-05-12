import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://launchforma.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/dashboard/', '/wizard/', '/api/', '/sign-in', '/sign-up'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
