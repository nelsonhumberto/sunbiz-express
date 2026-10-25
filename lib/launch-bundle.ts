/**
 * Direct-link launch bundle. Entry is only /launch-bundle and /es/launch-bundle.
 * The price, cap, and partner commission live in lib/pricing.ts.
 */

import {
  LAUNCH_BUNDLE_CAP,
  LAUNCH_BUNDLE_PRICE_CENTS,
  LAUNCH_BUNDLE_REFERRAL_COMMISSION_CENTS,
  LAUNCH_BUNDLE_SOURCE,
  launchBundleCostBreakdown,
} from '@/lib/pricing';

export {
  LAUNCH_BUNDLE_CAP,
  LAUNCH_BUNDLE_PRICE_CENTS,
  LAUNCH_BUNDLE_REFERRAL_COMMISSION_CENTS,
  LAUNCH_BUNDLE_SOURCE,
  launchBundleCostBreakdown,
};

export const LAUNCH_BUNDLE_PATH = '/launch-bundle';

/** Add-ons locked onto a bundle filing. Registered agent year 1 is part of Essential. */
export const LAUNCH_BUNDLE_ADD_ON_SLUGS = [
  'registered_agent',
  'ein',
  'operating_agreement_single',
] as const;

export type LaunchBundleAddOnSlug = (typeof LAUNCH_BUNDLE_ADD_ON_SLUGS)[number];

/** Postgres advisory lock so concurrent payment-intent checks read the same count. */
export const LAUNCH_BUNDLE_ADVISORY_LOCK = 1990010;

export function isLaunchBundleSource(filingSource: string | null | undefined): boolean {
  return filingSource === LAUNCH_BUNDLE_SOURCE;
}

export function isLaunchBundleFiling(filing: { filingSource?: string | null }): boolean {
  return isLaunchBundleSource(filing.filingSource);
}

/** Browser path, with or without the Spanish prefix. */
export function isLaunchBundlePath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? '').split('?')[0]?.split('#')[0] ?? '';
  const bare = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return bare === LAUNCH_BUNDLE_PATH || bare === `/es${LAUNCH_BUNDLE_PATH}`;
}

export function launchBundleSoldOutMessage(locale: string | null | undefined): string {
  return locale === 'es'
    ? 'Este paquete de lanzamiento ya se agotó.'
    : 'This launch bundle is sold out.';
}

/**
 * Paid bundle orders that consume a slot.
 * Test filings and test payments do not count. A later add-on charge at a
 * different amount does not count as another bundle order.
 */
export interface LaunchBundlePaymentRow {
  filingId: string;
  status: string;
  isTest: boolean;
  filingIsTest: boolean;
  amountCents: number;
}

export function countsTowardLaunchBundleCap(row: LaunchBundlePaymentRow): boolean {
  return (
    row.status === 'SUCCEEDED' &&
    row.isTest === false &&
    row.filingIsTest === false &&
    row.amountCents === LAUNCH_BUNDLE_PRICE_CENTS
  );
}

/** One slot per filing. Repeat payments on the same filing do not add slots. */
export function paidLaunchBundleSlots(rows: readonly LaunchBundlePaymentRow[]): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (countsTowardLaunchBundleCap(row)) ids.add(row.filingId);
  }
  return ids.size;
}

/** True while fewer than {@link LAUNCH_BUNDLE_CAP} paid bundle orders exist. */
export function launchBundlePaymentAllowed(paidSlots: number): boolean {
  return paidSlots < LAUNCH_BUNDLE_CAP;
}

/**
 * Query shape for the cap. isTest filings and isTest payments are excluded.
 * Count filings, not payment rows, so a later certificate charge is not an 11th order.
 */
export const paidLaunchBundleWhere = {
  filingSource: LAUNCH_BUNDLE_SOURCE,
  isTest: false,
  payments: {
    some: {
      status: 'SUCCEEDED',
      isTest: false,
      amountCents: LAUNCH_BUNDLE_PRICE_CENTS,
    },
  },
} as const;

/** Partner code from ?ref=. Empty and unsafe values are dropped. */
export function normalizeReferralRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) return null;
  return trimmed;
}

export function launchBundleOptionalDetails(ref: string | null): string {
  return JSON.stringify({
    launchBundle: true,
    ...(ref
      ? {
          referralRef: ref,
          referralCommissionCents: LAUNCH_BUNDLE_REFERRAL_COMMISSION_CENTS,
        }
      : {}),
  });
}

/** Keep an existing partner code. A later visit does not overwrite it. */
export function mergeReferralRef(existingJson: string | null | undefined, ref: string | null): string {
  let prev: Record<string, unknown> = {};
  if (existingJson) {
    try {
      const parsed = JSON.parse(existingJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        prev = parsed as Record<string, unknown>;
      }
    } catch {
      prev = {};
    }
  }
  const current =
    typeof prev.referralRef === 'string' ? normalizeReferralRef(prev.referralRef) : null;
  const next = current ?? ref;
  return JSON.stringify({
    ...prev,
    launchBundle: true,
    ...(next
      ? {
          referralRef: next,
          referralCommissionCents:
            typeof prev.referralCommissionCents === 'number'
              ? prev.referralCommissionCents
              : LAUNCH_BUNDLE_REFERRAL_COMMISSION_CENTS,
        }
      : {}),
  });
}
