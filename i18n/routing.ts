import { defineRouting } from 'next-intl/routing';

/**
 * Cookie and Accept-Language detection are off. `/es` is Spanish because of
 * the path prefix. Every other path is English. The language toggle is the
 * only place that writes NEXT_LOCALE.
 */
export const routing = defineRouting({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
  localeDetection: false,
  /**
   * Only slugs that differ by language live here. Every other public URL
   * stays the same under `/es`. Middleware rewrites `/es/contacto` to the
   * `/contact` page and 308s the non-canonical slugs.
   */
  pathnames: {
    '/contact': {
      en: '/contact',
      es: '/contacto',
    },
  },
});
