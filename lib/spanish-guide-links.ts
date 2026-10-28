import { englishPathname } from './locale-paths';

export type SpanishGuideLink = {
  href: string;
  /** Spanish page title. Must match the guide's `title` in messages/es.json. */
  label: string;
};

export const SPANISH_GUIDE_LLC_COSTO: SpanishGuideLink = {
  href: '/es/guides/costo-llc-florida',
  label: 'Precio de una LLC en Florida',
};

export const SPANISH_GUIDE_LLC_SIN_SSN: SpanishGuideLink = {
  href: '/es/guides/llc-florida-sin-seguro-social',
  label: 'Abrir una LLC en Florida sin SSN',
};

export const SPANISH_GUIDE_LLC_EXTRANJEROS: SpanishGuideLink = {
  href: '/es/guides/llc-florida-para-extranjeros',
  label: 'Abrir una LLC en Florida siendo extranjero no residente',
};

export const SPANISH_GUIDE_MIAMI: SpanishGuideLink = {
  href: '/es/guides/licencia-negocio-miami-dade',
  label: 'Licencia de negocio en Miami-Dade después de formar tu LLC',
};

export const SPANISH_GUIDE_BROWARD: SpanishGuideLink = {
  href: '/es/guides/licencia-negocio-broward',
  label: 'Licencia de negocio en Broward y Fort Lauderdale',
};

export const SPANISH_GUIDE_LLC_VS_SOLE: SpanishGuideLink = {
  href: '/es/guides/llc-o-negocio-individual-florida',
  label: '¿LLC o negocio individual en Florida?',
};

export const SPANISH_GUIDE_LLC_APP: SpanishGuideLink = {
  href: '/es/guides/llc-para-tu-app-florida',
  label: 'LLC para tu app en Florida',
};

/** Related Spanish guides for /guides/how-to-form-an-llc-in-florida. */
export const EN_FORM_LLC_SPANISH_LINKS: readonly SpanishGuideLink[] = [
  SPANISH_GUIDE_LLC_SIN_SSN,
  SPANISH_GUIDE_LLC_VS_SOLE,
];

/** Related Spanish guides for the Florida annual-report guide and /states/florida. */
export const EN_FLORIDA_LICENSE_SPANISH_LINKS: readonly SpanishGuideLink[] = [
  SPANISH_GUIDE_MIAMI,
  SPANISH_GUIDE_BROWARD,
];

/** Spanish-only guides, in sitemap order. The cost guide is an hreflang twin, not listed here. */
export const EN_GUIDES_INDEX_SPANISH_LINKS: readonly SpanishGuideLink[] = [
  SPANISH_GUIDE_LLC_SIN_SSN,
  SPANISH_GUIDE_LLC_EXTRANJEROS,
  SPANISH_GUIDE_MIAMI,
  SPANISH_GUIDE_BROWARD,
  SPANISH_GUIDE_LLC_VS_SOLE,
  SPANISH_GUIDE_LLC_APP,
];

const SPANISH_ONLY_GUIDE_PATHS = EN_GUIDES_INDEX_SPANISH_LINKS.map((link) =>
  englishPathname(link.href),
);

/** True for a Spanish-only guide, with or without the /es prefix. */
export function isSpanishOnlyGuidePath(pathname: string): boolean {
  const english = englishPathname(pathname);
  return SPANISH_ONLY_GUIDE_PATHS.some(
    (slug) => english === slug || english.startsWith(`${slug}/`),
  );
}
