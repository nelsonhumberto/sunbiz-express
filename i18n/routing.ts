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
   * Typed as Pathnames so href stays a string. The runtime map is unchanged:
   * only /contact has a Spanish slug. A checked sign-in `next` path is not
   * a key of this map, and neither are the rest of the app's links.
   */
  pathnames: {
    '/contact': {
      en: '/contact',
      es: '/contacto',
    },
  } as Pathnames<['en', 'es']>,
});
