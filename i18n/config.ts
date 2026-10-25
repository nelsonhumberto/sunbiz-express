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
 * `/es` and `/es/...` are Spanish entry URLs. Every other path is English.
 * The NEXT_LOCALE cookie does not select the language. `?lang=es` is redirected
 * onto the `/es` path. Returns the unprefixed pathname to rewrite to, or null
 * when the path is not a Spanish prefix.
 */
export function stripSpanishPrefix(pathname: string): string | null {
  if (pathname === '/es' || pathname === '/es/') return '/';
  if (!pathname.startsWith('/es/')) return null;
  const rest = pathname.slice(3);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/**
 * `/en` and `/en/...` are not public URLs. English is the unprefixed
 * default. Returns the path without that prefix, or null when the path
 * is not an English prefix (`/enterprise` and `/en-us` stay put).
 */
export function stripDefaultLocalePrefix(pathname: string): string | null {
  if (pathname === '/en' || pathname === '/en/') return '/';
  if (!pathname.startsWith('/en/')) return null;
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
        doNotSell: pickString(footer, 'doNotSell'),
      },
    };
  }
  // x-lf-pathname is the unprefixed route, so /es/contacto is `/contact` here.
  if (pathname === '/contact') return pick(messages, CONTACT_CLIENT_NAMESPACES);
  return omitPrivateNamespaces(messages);
}

/**
 * Client components on `/contact`: nav, footer, chat, and the inquiry form.
 * Legal and account namespaces stay on the server so help@, legal@, and
 * privacy@ never reach the contact page HTML.
 */
const CONTACT_CLIENT_NAMESPACES = [
  'assistant',
  'businessServices',
  'disclosure',
  'footer',
  'nav',
] as const;

/** Lodash-style pick. Missing keys are omitted. */
function pick(messages: AbstractIntlMessages, keys: readonly string[]): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(messages, key)) out[key] = messages[key];
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function pickString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}
