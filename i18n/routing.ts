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
});
