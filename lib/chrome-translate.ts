import type { Metadata } from 'next';

/**
 * Opt an English subtree out of Chrome's translator.
 * Spanish pages must stay translatable, so a non-English locale gets nothing.
 */
export function chromeTranslateOptOut(locale: string): {
  translate?: 'no';
  className?: 'notranslate';
} {
  if (locale !== 'en') return {};
  return { translate: 'no', className: 'notranslate' };
}

/**
 * Chrome's translate prompt is page-level. `translate="no"` and `.notranslate`
 * tell the translator to skip a subtree after a pass starts. They do not stop
 * the infobar, or an "always translate English" pass, which is what wraps
 * React text in `<font>` and crashes the wizard. This meta is that opt-out.
 * Next emits `<meta name="google" content="notranslate">`. English wizard only.
 */
export function englishWizardNotranslateMeta(
  locale: string,
): Pick<Metadata, 'other'> {
  if (locale !== 'en') return {};
  return { other: { google: 'notranslate' } };
}
