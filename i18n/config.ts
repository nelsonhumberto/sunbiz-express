// Locale configuration for next-intl.
// Uses cookie-based locale switching (no URL prefix) to keep routes flat.

export type Locale = 'en' | 'es';

export const locales: Locale[] = ['en', 'es'];
export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};

export const localeFlags: Record<Locale, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
};

export const LOCALE_COOKIE = 'NEXT_LOCALE';
