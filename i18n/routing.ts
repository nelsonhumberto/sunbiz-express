import { defineRouting, type Pathnames } from 'next-intl/routing';

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
   *
   * Typed as Pathnames so href stays a string. A checked sign-in `next` path
   * is not a key of this map, and neither are the rest of the app's links.
   * Spanish slugs: `/contact` is `/contacto`, and the stylists page is
   * `/llc-para/estilistas-barberos`.
   */
  pathnames: {
    '/contact': {
      en: '/contact',
      es: '/contacto',
    },
    '/llc-for/stylists-barbers': {
      en: '/llc-for/stylists-barbers',
      es: '/llc-para/estilistas-barberos',
    },
    '/lp/florida-llc': {
      en: '/lp/florida-llc',
      es: '/lp/llc-florida',
    },
  } as Pathnames<['en', 'es']>,
});
