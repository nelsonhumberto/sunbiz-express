/**
 * Full marketing cookies (Google storage granted, OpenAI pixel) load only
 * after this cookie is `all`, and never when the ad opt-out is on.
 * Google tag itself loads earlier in Consent Mode with storage denied.
 * PostHog is separate and is not gated here.
 */

export const ADS_CONSENT_COOKIE = 'lf_ads_consent';
export const ADS_CONSENT_ALL = 'all';
export const ADS_CONSENT_ESSENTIAL = 'essential';
export const ADS_CONSENT_EVENT = 'lf-ads-consent';
export const ADS_CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

export function readAdsConsent(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== ADS_CONSENT_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value || null;
  }
  return null;
}

/** Marketing tags require an explicit accept, no ad opt-out, and a non-tester browser. */
export function marketingTagsAllowed(input: {
  consent: string | null;
  optedOut: boolean;
  tester?: boolean;
}): boolean {
  if (input.optedOut || input.tester) return false;
  return input.consent === ADS_CONSENT_ALL;
}

/** The cookie bar sets `--lf-cookie-h` to its height, or `0px` when it is closed. */
export function cookieBannerIsOpen(heightValue: string | null | undefined): boolean {
  const height = Number.parseFloat((heightValue ?? '').trim());
  return Number.isFinite(height) && height > 0;
}

/** The bar is shown once, until the visitor chooses or an opt-out is already set. */
export function shouldShowCookieNotice(input: { consent: string | null; optedOut: boolean }): boolean {
  if (input.optedOut) return false;
  return input.consent !== ADS_CONSENT_ALL && input.consent !== ADS_CONSENT_ESSENTIAL;
}

export function serializeAdsConsentCookie(value: typeof ADS_CONSENT_ALL | typeof ADS_CONSENT_ESSENTIAL): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ADS_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${ADS_CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
}
