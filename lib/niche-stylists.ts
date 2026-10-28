import type { Metadata } from 'next';

/** English public path. The page file lives here. */
export const NICHE_STYLISTS_EN_PATH = '/llc-for/stylists-barbers';
/** Spanish public path, including the /es prefix. */
export const NICHE_STYLISTS_ES_PATH = '/es/llc-para/estilistas-barberos';

const SITE = 'https://launchforma.com';

export const NICHE_STYLISTS_EN_URL = `${SITE}${NICHE_STYLISTS_EN_PATH}`;
export const NICHE_STYLISTS_ES_URL = `${SITE}${NICHE_STYLISTS_ES_PATH}`;

/**
 * Feature flag `niche_bundle_block`.
 * Server env NICHE_BUNDLE_BLOCK_ENABLED. Unset, empty, and any value other
 * than true/1/yes/on stay off. Default is off. Both locales.
 */
export function nicheBundleBlockEnabled(): boolean {
  const raw = process.env['NICHE_BUNDLE_BLOCK_ENABLED'];
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

const INLINE_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Visible sentence: markdown links become their labels. */
export function faqAnswerText(source: string): string {
  return source.replace(INLINE_LINK, '$1');
}

export interface InlinePart {
  type: 'text' | 'link';
  text: string;
  href?: string;
}

/** Split a message into text and links. Href is used as written. */
export function inlineParts(source: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE_LINK)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: 'text', text: source.slice(last, index) });
    const href = match[2] ?? '';
    if (href.startsWith('/') && !href.startsWith('//')) {
      parts.push({ type: 'link', text: match[1] ?? '', href });
    } else {
      parts.push({ type: 'text', text: match[0] ?? '' });
    }
    last = index + match[0].length;
  }
  if (last < source.length) parts.push({ type: 'text', text: source.slice(last) });
  return parts;
}

export interface NicheItem {
  title: string;
  body: string;
}

export interface NicheLink {
  label: string;
  href: string;
}

export interface NicheFaq {
  q: string;
  a: string;
}

export interface NicheStylistsCopy {
  locale: 'en' | 'es';
  metaTitle: string;
  metaDescription: string;
  h1: string;
  subhead: string;
  ctaLabel: string;
  ctaHref: string;
  stepsTitle: string;
  steps: NicheItem[];
  dayTitle: string;
  dayOne: NicheItem[];
  laterTitle: string;
  laterIntro: string;
  later: string[];
  licenseTitle: string;
  licenseBody: string;
  essentialTitle: string;
  essentialBody: string;
  toolsTitle: string;
  tools: NicheLink[];
  faqTitle: string;
  faq: NicheFaq[];
  readyTitle: string;
  readyBody: string;
}

export interface NicheBundleCopy {
  title: string;
  body: string;
}

type NicheTranslator = (key: string) => string;

const STEP_COUNT = 3;
const DAY_COUNT = 3;
const LATER_COUNT = 4;
const FAQ_COUNT = 7;

export function readNicheStylistsCopy(t: NicheTranslator, locale: 'en' | 'es'): NicheStylistsCopy {
  return {
    locale,
    metaTitle: t('metaTitle'),
    metaDescription: t('metaDescription'),
    h1: t('h1'),
    subhead: t('subhead'),
    ctaLabel: t('ctaLabel'),
    ctaHref: t('ctaHref'),
    stepsTitle: t('stepsTitle'),
    steps: Array.from({ length: STEP_COUNT }, (_, i) => ({
      title: t(`step${i + 1}Title`),
      body: t(`step${i + 1}Body`),
    })),
    dayTitle: t('dayTitle'),
    dayOne: Array.from({ length: DAY_COUNT }, (_, i) => ({
      title: t(`day${i + 1}Title`),
      body: t(`day${i + 1}Body`),
    })),
    laterTitle: t('laterTitle'),
    laterIntro: t('laterIntro'),
    later: Array.from({ length: LATER_COUNT }, (_, i) => t(`later${i + 1}`)),
    licenseTitle: t('licenseTitle'),
    licenseBody: t('licenseBody'),
    essentialTitle: t('essentialTitle'),
    essentialBody: t('essentialBody'),
    toolsTitle: t('toolsTitle'),
    tools: [
      { label: t('tool1Label'), href: t('tool1Href') },
      { label: t('tool2Label'), href: t('tool2Href') },
    ],
    faqTitle: t('faqTitle'),
    faq: Array.from({ length: FAQ_COUNT }, (_, i) => ({
      q: t(`faq${i + 1}q`),
      a: t(`faq${i + 1}a`),
    })),
    readyTitle: t('readyTitle'),
    readyBody: t('readyBody'),
  };
}

export function readNicheBundleCopy(t: NicheTranslator): NicheBundleCopy {
  return {
    title: t('bundleTitle'),
    body: t('bundleBody'),
  };
}

/** FAQ items whose answer text is what a reader sees, links included as labels. */
export function nicheVisibleFaq(copy: NicheStylistsCopy): { q: string; a: string }[] {
  return copy.faq.map((item) => ({ q: item.q, a: faqAnswerText(item.a) }));
}

export function nicheMetadataAlternates(locale: 'en' | 'es'): NonNullable<Metadata['alternates']> {
  return {
    canonical: locale === 'es' ? NICHE_STYLISTS_ES_URL : NICHE_STYLISTS_EN_URL,
    languages: {
      en: NICHE_STYLISTS_EN_URL,
      es: NICHE_STYLISTS_ES_URL,
      'x-default': NICHE_STYLISTS_EN_URL,
    },
  };
}
