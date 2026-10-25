import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { isSpanishPublicPath, PUBLIC_PATH_HEADER, toSpanishUrl } from '@/lib/locale-paths';

export { PUBLIC_PATH_HEADER, LOCALE_HEADER } from '@/lib/locale-paths';

/**
 * hreflang set shared by an English URL and its /es counterpart.
 * `es` always points at the /es path. It never points at `/`.
 * The canonical is self-referencing: English URL on the English page,
 * /es URL on the Spanish page.
 */
export function localeAlternates(
  englishPath: string,
  requestPath: string,
): NonNullable<Metadata['alternates']> {
  const es = toSpanishUrl(englishPath);
  const esPath = (es.split('?')[0] ?? es).split('#')[0];
  if (!esPath || esPath === '/') {
    throw new Error('hreflang es must not point at the English homepage');
  }
  const onSpanish = isSpanishPublicPath(requestPath);
  return {
    canonical: onSpanish ? es : englishPath,
    languages: {
      en: englishPath,
      es,
      'x-default': englishPath,
    },
  };
}

/**
 * hreflang for a Spanish-only URL. There is no English article, and the
 * unprefixed path 308-redirects to /es, so `en` is omitted on purpose.
 */
export function spanishOnlyAlternates(esPath: string): NonNullable<Metadata['alternates']> {
  return {
    canonical: esPath,
    languages: {
      es: esPath,
      'x-default': esPath,
    },
  };
}

/**
 * hreflang for an English-only URL. There is no Spanish article yet, so
 * `es` is omitted. Do not point hreflang at a page that does not exist.
 */
export function englishOnlyAlternates(englishPath: string): NonNullable<Metadata['alternates']> {
  return {
    canonical: englishPath,
    languages: {
      en: englishPath,
      'x-default': englishPath,
    },
  };
}

export function buildLocaleAlternates(englishPath: string): NonNullable<Metadata['alternates']> {
  const requestPath = headers().get(PUBLIC_PATH_HEADER) ?? '';
  return localeAlternates(englishPath, requestPath);
}

export function withLocaleMeta(englishPath: string, meta: Metadata, locale: string): Metadata {
  const alternates = buildLocaleAlternates(englishPath);
  const og = meta.openGraph;
  return {
    ...meta,
    alternates,
    openGraph:
      og && typeof og === 'object'
        ? { ...og, locale: locale === 'es' ? 'es_US' : 'en_US' }
        : { locale: locale === 'es' ? 'es_US' : 'en_US' },
  };
}
