const LI_FAT_ID_PARAM = 'li_fat_id';

/**
 * Remove only `li_fat_id` from an absolute URL.
 * UTM params, `gclid`, and the hash stay. The original string is returned
 * when the param is absent, so a clean URL is not rewritten.
 */
export function hrefWithoutLiFatId(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (!url.searchParams.has(LI_FAT_ID_PARAM)) return href;
  url.searchParams.delete(LI_FAT_ID_PARAM);
  return `${url.origin}${url.pathname}${url.search}${url.hash}`;
}

/** Drop `li_fat_id` from the address bar before analytics reads the landing URL. */
export function stripLiFatIdFromLocation(): void {
  if (typeof window === 'undefined') return;
  const href = window.location?.href;
  if (!href || typeof window.history?.replaceState !== 'function') return;
  const next = hrefWithoutLiFatId(href);
  if (next === href) return;
  try {
    const url = new URL(next);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* a malformed location should not block analytics */
  }
}

/** Inline script. Runs before PostHog and gtag so those scripts never see `li_fat_id`. */
export const LI_FAT_ID_STRIP_SCRIPT =
  "(function(){try{var u=new URL(location.href);if(!u.searchParams.has('li_fat_id'))return;u.searchParams.delete('li_fat_id');history.replaceState(history.state,'',u.pathname+u.search+u.hash);}catch(e){}})();";
