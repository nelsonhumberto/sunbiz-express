import 'server-only';

import { redirect as nextRedirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { hrefForLocale, isSpanishHref } from '@/lib/app-href';
import { pickLocale, type SiteLocale } from '@/lib/pick-locale';
import { safeRedirectPath } from '@/lib/utils';

export async function localeForRedirect(filingLocale?: string | null): Promise<SiteLocale> {
  let requestLocale: string | null = null;
  try {
    requestLocale = await getLocale();
  } catch {
    requestLocale = null;
  }
  return pickLocale(requestLocale, filingLocale);
}

/**
 * next-intl redirect. An href that is already /es/... is sent through
 * Next's redirect so it is not prefixed a second time.
 */
export async function redirectLocalized(
  href: string,
  filingLocale?: string | null,
): Promise<never> {
  const safe = safeRedirectPath(href);
  const locale = await localeForRedirect(filingLocale);
  if (!safe) {
    redirect({ href: '/dashboard', locale });
    throw new Error('Redirect did not stop execution.');
  }
  if (isSpanishHref(safe)) {
    nextRedirect(safe);
    throw new Error('Redirect did not stop execution.');
  }
  redirect({ href: safe, locale });
  throw new Error('Redirect did not stop execution.');
}

/** Build a same-origin next= target, prefixed when the locale is Spanish. */
export async function localizedNextParam(
  raw: string | null | undefined,
  filingLocale?: string | null,
): Promise<string | null> {
  const safe = safeRedirectPath(raw);
  if (!safe) return null;
  const locale = await localeForRedirect(filingLocale);
  return hrefForLocale(safe, locale);
}
