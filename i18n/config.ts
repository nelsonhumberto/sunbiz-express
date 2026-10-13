// Locale configuration for next-intl.
// Uses cookie-based locale switching (no URL prefix) to keep routes flat.

import type { AbstractIntlMessages } from 'next-intl';

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

/**
 * Message namespaces used only by signed-in screens (dashboard, admin, the
 * post-formation EIN add-on). The root layout omits them so they never ship
 * in public page HTML; the (app) and admin layouts provide the full set.
 */
export const PRIVATE_NAMESPACES: readonly string[] = [
  'dashboard',
  'admin',
  'filingDetail',
  'checkoutSuccess',
  'einForm',
];

export function omitPrivateNamespaces(messages: AbstractIntlMessages): AbstractIntlMessages {
  return Object.fromEntries(
    Object.entries(messages).filter(([ns]) => !PRIVATE_NAMESPACES.includes(ns)),
  );
}
