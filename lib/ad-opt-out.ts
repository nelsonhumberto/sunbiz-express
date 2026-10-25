/**
 * Do Not Sell or Share / Global Privacy Control.
 *
 * A visitor is opted out of Google Analytics, Google Ads, and the OpenAI ads
 * pixel when any of these is true:
 *   - first-party cookie `lf_ad_optout=1` (explicit choice, kept for 1 year)
 *   - request header `Sec-GPC: 1`
 *   - `navigator.globalPrivacyControl === true`
 *
 * GPC alone does not write that 1-year cookie. It may set `lf_ad_optout=gpc`,
 * which is cleared on a later request that has no GPC signal and does not
 * opt the visitor out by itself.
 *
 * PostHog, Vercel Analytics, essential cookies, and Stripe attribution are
 * not affected.
 */

export const AD_OPT_OUT_COOKIE = 'lf_ad_optout';
/** Explicit Do Not Sell or Share choice. Kept for 1 year. */
export const AD_OPT_OUT_VALUE = '1';
/** Present only while Global Privacy Control is the reason for the opt-out. */
export const AD_OPT_OUT_GPC_VALUE = 'gpc';
/** 1 year. Applies to an explicit opt-out, not to a GPC-derived marker. */
export const AD_OPT_OUT_MAX_AGE = 60 * 60 * 24 * 365;
export const AD_OPT_OUT_EVENT = 'lf-ad-optout-change';

const BLOCKED_SCRIPT =
  /googletagmanager\.com|google-analytics\.com|googleadservices\.com|doubleclick\.net|bzrcdn\.openai\.com|bzr\.openai\.com/;

export function adOptOutCookieSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Read `lf_ad_optout` from a Cookie header or `document.cookie` string. */
export function adOptOutCookieValue(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== AD_OPT_OUT_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export function serializeAdOptOutCookie(optedOut: boolean, secure: boolean): string {
  const base = optedOut
    ? `${AD_OPT_OUT_COOKIE}=${AD_OPT_OUT_VALUE}; Path=/; Max-Age=${AD_OPT_OUT_MAX_AGE}; SameSite=Lax`
    : `${AD_OPT_OUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

/** Marker written when GPC is the only opt-out. A later request without GPC clears it. */
export function serializeGpcDerivedCookie(secure: boolean): string {
  const base = `${AD_OPT_OUT_COOKIE}=${AD_OPT_OUT_GPC_VALUE}; Path=/; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

export type GpcCookieDecision = 'set-gpc' | 'clear' | 'leave';

/**
 * `lf_ad_optout=1` is an explicit choice and is never replaced or cleared here.
 * GPC with no explicit choice records `gpc`. That marker is removed when GPC is gone.
 */
export function gpcCookieDecision(cookie: string | null | undefined, gpc: boolean): GpcCookieDecision {
  if (cookie === AD_OPT_OUT_VALUE) return 'leave';
  if (gpc) return cookie === AD_OPT_OUT_GPC_VALUE ? 'leave' : 'set-gpc';
  if (cookie === AD_OPT_OUT_GPC_VALUE) return 'clear';
  return 'leave';
}

export type AdOptOutSignals = {
  cookie?: string | null;
  secGpc?: string | null;
  /** True when the document request included `Sec-GPC: 1`. */
  serverGpc?: boolean;
  globalPrivacyControl?: boolean | null;
};

/**
 * Whether to inject gtag.js and the OpenAI pixel.
 * An explicit cookie (`1`) blocks tags for a year. A GPC-derived cookie
 * (`gpc`) does not: only a live GPC signal does, and that cookie is cleared
 * once the signal is gone. `serverGpc` covers the header on this request.
 */
export function shouldInjectAdScripts(input: AdOptOutSignals): boolean {
  if (input.serverGpc) return false;
  if (input.secGpc === '1') return false;
  if (input.globalPrivacyControl === true) return false;
  if (input.cookie === AD_OPT_OUT_VALUE) return false;
  return true;
}

export function isAdMeasurementOptedOut(input: AdOptOutSignals): boolean {
  return !shouldInjectAdScripts(input);
}

type GpcNavigator = Navigator & { globalPrivacyControl?: boolean };

export function readAdOptOutCookieFromDocument(): string | null {
  if (typeof document === 'undefined') return null;
  return adOptOutCookieValue(document.cookie);
}

export function readGlobalPrivacyControl(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator as GpcNavigator).globalPrivacyControl === true;
}

export function isClientAdMeasurementOptedOut(): boolean {
  return isAdMeasurementOptedOut({
    cookie: readAdOptOutCookieFromDocument(),
    globalPrivacyControl: readGlobalPrivacyControl(),
  });
}

export function writeClientAdOptOut(optedOut: boolean): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  document.cookie = serializeAdOptOutCookie(optedOut, adOptOutCookieSecure());
  window.dispatchEvent(new Event(AD_OPT_OUT_EVENT));
}

/** Keep `lf_ad_optout=gpc` in step with a live GPC signal. Never writes the 1-year value. */
export function syncGpcDerivedCookie(gpc: boolean): void {
  if (typeof document === 'undefined') return;
  const decision = gpcCookieDecision(readAdOptOutCookieFromDocument(), gpc);
  if (decision === 'set-gpc') {
    document.cookie = serializeGpcDerivedCookie(adOptOutCookieSecure());
    return;
  }
  if (decision === 'clear') {
    document.cookie = serializeAdOptOutCookie(false, adOptOutCookieSecure());
  }
}

function measurementIds(): string[] {
  return [process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID, process.env.NEXT_PUBLIC_GOOGLE_ADS_ID].filter(
    (id): id is string => Boolean(id),
  );
}

export function clearGaDisableFlags(): void {
  if (typeof window === 'undefined') return;
  const record = window as unknown as Record<string, unknown>;
  for (const id of measurementIds()) record[`ga-disable-${id}`] = false;
}

/** Stop tags that already loaded in this tab. A reload stays clean because we never inject them. */
export function tearDownAdMeasurement(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const record = window as unknown as Record<string, unknown>;
  for (const id of measurementIds()) record[`ga-disable-${id}`] = true;
  document.querySelectorAll('script').forEach((script) => {
    const src = script.getAttribute('src') ?? '';
    if (BLOCKED_SCRIPT.test(src) || script.id === 'google-analytics' || script.id === 'openai-ads-pixel') {
      script.parentNode?.removeChild(script);
    }
  });
  delete record.gtag;
  delete record.oaiq;
}
