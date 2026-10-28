/**
 * Google Ads conversions fired through the existing gtag loader.
 *
 * Filing Purchase uses NEXT_PUBLIC_GOOGLE_ADS_ID and
 * NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL (already set in production).
 *
 * Begin Filing uses NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING.
 * Production sets that variable. The hit is once per filing
 * (localStorage lf_ads_begin:{id}), value 1 USD. The label stays in env.
 * Do not hardcode it.
 *
 * Preview verification: on a Vercel preview deployment, add `?lf_ads_debug=1`.
 * A suppressed test hit is logged and not sent. A real hit is sent and logged.
 * The flag does nothing in production.
 */

import { hasQaCookie } from '@/lib/qa-marker';

export const BEGIN_FILING_LABEL_ENV = 'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGIN_FILING';
export const PURCHASE_LABEL_ENV = 'NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL';
export const ADS_ID_ENV = 'NEXT_PUBLIC_GOOGLE_ADS_ID';
export const ADS_DEBUG_PARAM = 'lf_ads_debug';
export const PURCHASE_CONVERSION_PREFIX = 'lf_ads_purchase:';
export const BEGIN_CONVERSION_PREFIX = 'lf_ads_begin:';

const QA_LAUNCHFORMA = /^qa\+.*@launchforma\.com$/i;

export type AdsSuppressionInput = {
  isTester?: boolean | null;
  isTest?: boolean | null;
  qaMarked?: boolean | null;
  emails?: Array<string | null | undefined>;
};

export function isLaunchformaQaEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return QA_LAUNCHFORMA.test(email.trim());
}

export function shouldSuppressAdsConversion(input: AdsSuppressionInput): boolean {
  if (input.isTester) return true;
  if (input.isTest) return true;
  if (input.qaMarked) return true;
  return (input.emails ?? []).some((email) => isLaunchformaQaEmail(email));
}

/** The QA cookie only suppresses this browser. It is not an authorization signal. */
export function qaCookieSuppressesAds(cookieHeader: string | null | undefined): boolean {
  return hasQaCookie(cookieHeader);
}

export function purchaseConversionStorageKey(transactionId: string): string {
  return `${PURCHASE_CONVERSION_PREFIX}${transactionId}`;
}

export function beginConversionStorageKey(filingId: string): string {
  return `${BEGIN_CONVERSION_PREFIX}${filingId}`;
}

/** Begin Filing is 1 USD. An empty filing id cannot be deduped, so it is not sent. */
export function beginFilingPayload(filingId: string | null | undefined): GtagPurchasePayload | null {
  const transactionId = filingId?.trim() ?? '';
  if (!transactionId) return null;
  return { transaction_id: transactionId, value: 1, currency: 'USD' };
}

/** `?lf_ads_debug=1` logs the gtag payload. Preview deployments only. */
export function adsDebugActive(
  search: string,
  vercelEnv: string | undefined = process.env.NEXT_PUBLIC_VERCEL_ENV,
): boolean {
  if (vercelEnv !== 'preview') return false;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get(ADS_DEBUG_PARAM) === '1';
}

export function adsSendTo(adsId: string | undefined, label: string | undefined): string | null {
  const id = adsId?.trim();
  const conversionLabel = label?.trim();
  if (!id || !conversionLabel) return null;
  return `${id}/${conversionLabel}`;
}

export type GtagPurchasePayload = {
  transaction_id: string;
  value: number;
  currency: 'USD' | string;
};

export function purchasePayload(input: {
  transactionId: string;
  valueCents: number;
  currency?: string | null;
}): GtagPurchasePayload | null {
  const transactionId = input.transactionId.trim();
  if (!transactionId) return null;
  if (!Number.isFinite(input.valueCents)) return null;
  const currency = (input.currency ?? 'USD').trim().toUpperCase() || 'USD';
  return {
    transaction_id: transactionId,
    value: input.valueCents / 100,
    currency,
  };
}
