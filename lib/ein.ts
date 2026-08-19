// EIN entitlement + status helpers.
//
// Centralises the rules that determine whether a filing needs to collect
// IRS Form SS-4 responsible-party data, and what UI state to show. Used by
// the wizard payment gate, the dashboard, and the admin queue.

import type { AddOnSlug, TierSlug } from './pricing';
import { tierBundledAddOns } from './pricing';

/**
 * True when the filing is purchasing EIN - either as part of its tier or as
 * a standalone add-on. Drives the "EIN responsible party" panel on payment.
 */
export function filingIncludesEin(args: {
  tier: TierSlug;
  addOnSlugs: readonly AddOnSlug[];
}): boolean {
  if (tierBundledAddOns(args.tier).includes('ein')) return true;
  return args.addOnSlugs.includes('ein');
}

/** EIN application lifecycle states. Mirrors `EinApplication.status`. */
export type EinStatus =
  | 'not_needed'
  | 'needs_info'
  | 'ready_online'
  | 'manual_foreign'
  | 'submitted'
  | 'delivered';

export const EIN_STATUS_LABEL: Record<EinStatus, string> = {
  not_needed: 'Not in package',
  needs_info: 'Awaiting customer info',
  ready_online: 'Ready - IRS online filing',
  manual_foreign: 'Manual processing - foreign applicant',
  submitted: 'Submitted to IRS',
  delivered: 'EIN delivered',
};

/** US-only tax ID types accepted for the IRS online EIN Assistant. */
export const US_TAX_ID_TYPES = ['SSN', 'ITIN', 'EIN'] as const;
export type UsTaxIdType = (typeof US_TAX_ID_TYPES)[number];

/** Strict 9-digit format check for SSN/ITIN/EIN entry. */
export function looksLikeUsTaxId(value: string): boolean {
  return /^\d{9}$/.test(value.replace(/\D/g, ''));
}

/**
 * Strip everything except digits and return the last 4 (used by both UI
 * masking and the unencrypted `*Last4` columns).
 */
export function lastFourDigits(value: string): string {
  return value.replace(/\D/g, '').slice(-4);
}

/**
 * Decide which IRS pathway applies based on responsible-party origin. US
 * applicants with an SSN/ITIN can use the IRS online EIN Assistant
 * (straight-through). Foreign applicants without one cannot - the IRS
 * requires a phone, fax, or mail Form SS-4 (manual). See
 * https://www.irs.gov/instructions/iss4.
 */
export function classifyEinPathway(args: {
  responsiblePartyType: 'us' | 'foreign';
  taxIdType?: string | null;
}): 'ready_online' | 'manual_foreign' {
  if (args.responsiblePartyType === 'us' && args.taxIdType) {
    return 'ready_online';
  }
  return 'manual_foreign';
}
