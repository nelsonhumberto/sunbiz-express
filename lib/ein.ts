// EIN entitlement + status helpers.
//
// Centralises the rules that determine whether a filing needs to collect
// IRS Form SS-4 responsible-party data, and what UI state to show. Used by
// the dashboard EIN page, document generation, and the admin queue.

import type { AddOnSlug, TierSlug } from './pricing';

/**
 * EIN moved out of the formation packages into a post-formation dashboard
 * add-on (Google Ads restricts advertising EIN services). Popular and Premium
 * filings started before this moment were sold with EIN included and keep it.
 */
export const EIN_UNBUNDLED_AT = new Date('2026-10-13T23:00:00Z');

/**
 * True when the filing is entitled to an EIN: bought from the dashboard (or
 * à la carte before the move), or bundled into a legacy Popular/Premium order.
 */
export function filingIncludesEin(args: {
  tier: TierSlug;
  addOnSlugs: readonly AddOnSlug[];
  createdAt: Date;
}): boolean {
  if (args.addOnSlugs.includes('ein')) return true;
  return (
    (args.tier === 'STANDARD' || args.tier === 'PREMIUM') && args.createdAt < EIN_UNBUNDLED_AT
  );
}

/** EIN can be ordered from the dashboard once the company is formed. */
export function canOrderEin(args: { status: string; entitled: boolean }): boolean {
  return args.status === 'APPROVED' && !args.entitled;
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
