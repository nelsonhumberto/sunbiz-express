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
/**
 * hreflang for an English guide and a Spanish guide whose slug differs.
 * `x-default` stays on the English URL. Canonical is chosen by the caller
 * via which path it passes as the page it is rendering: this helper is the
 * Spanish page's set, so the canonical is the Spanish URL.
 */
export function guideTwinAlternates(
  englishPath: string,
  esPath: string,
): NonNullable<Metadata['alternates']> {
  return {
    canonical: esPath,
    languages: {
      en: englishPath,
      es: esPath,
      'x-default': englishPath,
    },
  };
}

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

/** Default share image. Child openGraph objects replace the layout image, so every builder attaches this. */
export const SOCIAL_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'LaunchForma',
} as const;

export function attachSocialImages(meta: Metadata): Metadata {
  const og = meta.openGraph && typeof meta.openGraph === 'object' ? meta.openGraph : undefined;
  const tw = meta.twitter && typeof meta.twitter === 'object' ? meta.twitter : undefined;
  return {
    ...meta,
    openGraph: {
      ...(og ?? {}),
      images: og && 'images' in og && og.images ? og.images : [SOCIAL_IMAGE],
    },
    twitter: {
      ...(tw ?? {}),
      card: 'summary_large_image',
      images: tw && 'images' in tw && tw.images ? tw.images : [SOCIAL_IMAGE.url],
    },
  };
}

export function withLocaleMeta(englishPath: string, meta: Metadata, locale: string): Metadata {
  const alternates = buildLocaleAlternates(englishPath);
  const og = meta.openGraph;
  return attachSocialImages({
    ...meta,
    alternates,
    openGraph:
      og && typeof og === 'object'
        ? { ...og, locale: locale === 'es' ? 'es_US' : 'en_US' }
        : { locale: locale === 'es' ? 'es_US' : 'en_US' },
  });
}
