/**
 * Google Consent Mode v2, advanced (denied by default).
 *
 * The inline bootstrap sets storage to denied before any config call.
 * A stored Accept updates to granted, still before config.
 * Decline and a missing choice stay denied, so gtag.js can send cookieless hits.
 * Opt-out never reaches this bootstrap: the gate does not load the tag.
 */

import { LI_FAT_ID_STRIP_SCRIPT } from '@/lib/strip-li-fat-id';

export const GOOGLE_CONSENT_WAIT_MS = 500;
export const GOOGLE_BOOTSTRAP_FLAG = '__lfGtagBootstrapped';

export const GOOGLE_CONSENT_DENIED = {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
} as const;

export const GOOGLE_CONSENT_GRANTED = {
  ad_storage: 'granted',
  analytics_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
} as const;

export type GoogleConsentChoice = 'granted' | 'denied';

export function googleConsentChoice(input: {
  consent: string | null;
  optedOut: boolean;
}): GoogleConsentChoice {
  if (input.optedOut) return 'denied';
  return input.consent === 'all' ? 'granted' : 'denied';
}

export function applyGoogleConsent(choice: GoogleConsentChoice): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function')
    return;
  window.gtag(
    'consent',
    'update',
    choice === 'granted'
      ? { ...GOOGLE_CONSENT_GRANTED }
      : { ...GOOGLE_CONSENT_DENIED },
  );
}

export function clearGoogleTagBootstrap(): void {
  if (typeof window === 'undefined') return;
  try {
    delete (window as unknown as Record<string, unknown>)[
      GOOGLE_BOOTSTRAP_FLAG
    ];
  } catch {
    /* a non-configurable flag must not block opt-out */
  }
}

function safeMeasurementId(id: string | null | undefined): string {
  const value = id?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return '';
  return value;
}

/** Script URL id. GA when set, otherwise the Ads id. Either one loads gtag.js. */
export function googleTagLoaderId(
  gaId?: string | null,
  adsId?: string | null,
): string | null {
  return safeMeasurementId(gaId) || safeMeasurementId(adsId) || null;
}

/**
 * Inline bootstrap. `li_fat_id` is stripped first. Consent default (denied)
 * runs before any config. A stored Accept grants before config.
 */
export function googleTagBootstrap(input: {
  gaId?: string | null;
  adsId?: string | null;
}): string {
  const gaId = safeMeasurementId(input.gaId);
  const adsId = safeMeasurementId(input.adsId);
  const configs: string[] = [];
  if (gaId)
    configs.push(
      `window.gtag('config', '${gaId}', { send_page_view: false });`,
    );
  if (adsId) configs.push(`window.gtag('config', '${adsId}');`);
  return `${LI_FAT_ID_STRIP_SCRIPT}
window.dataLayer = window.dataLayer || [];
if (!window.${GOOGLE_BOOTSTRAP_FLAG}) {
  window.${GOOGLE_BOOTSTRAP_FLAG} = 1;
  window.gtag = function gtag(){dataLayer.push(arguments);};
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: ${GOOGLE_CONSENT_WAIT_MS}
  });
  try {
    var lfCookie = document.cookie || '';
    var lfAccepted = /(?:^|;\\s*)lf_ads_consent=all(?:;|$)/.test(lfCookie);
    var lfOptOut = /(?:^|;\\s*)lf_ad_optout=1(?:;|$)/.test(lfCookie);
    var lfGpc = typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
    if (lfAccepted && !lfOptOut && !lfGpc) {
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        analytics_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted'
      });
    }
  } catch (e) {}
  window.gtag('js', new Date());
  ${configs.join('\n  ')}
}`;
}
