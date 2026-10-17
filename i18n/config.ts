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
 * `/es` and `/es/...` are Spanish entry URLs for ads. The app otherwise keeps
 * flat routes and stores the locale in a cookie (`?lang=es` still works).
 * Returns the unprefixed pathname to rewrite to, or null when the path is not
 * a Spanish prefix.
 */
export function stripSpanishPrefix(pathname: string): string | null {
  if (pathname === '/es' || pathname === '/es/') return '/';
  if (!pathname.startsWith('/es/')) return null;
  const rest = pathname.slice(3);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

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

/**
 * Strings the not-in-scope ad page renders. The root layout otherwise ships
 * the full public catalog, and unused footer/disclosure keys still name
 * annual reports and state filing. Only the keys this page uses are sent.
 */
export function messagesForPath(
  pathname: string,
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  if (pathname === '/business-services' || pathname.startsWith('/business-services/')) {
    const disclosure = asRecord(messages.disclosure);
    const footer = asRecord(messages.footer);
    return {
      businessServices: messages.businessServices ?? {},
      disclosure: {
        notAffiliatedServices: pickString(disclosure, 'notAffiliatedServices'),
      },
      footer: {
        terms: pickString(footer, 'terms'),
        privacy: pickString(footer, 'privacy'),
        refundPolicy: pickString(footer, 'refundPolicy'),
        disclaimer: pickString(footer, 'disclaimer'),
      },
    };
  }
  return omitPrivateNamespaces(messages);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function pickString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}
