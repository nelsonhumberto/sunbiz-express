// Lookup tables that map English-canonical labels coming from `lib/pricing.ts`
// (which is shared by server actions, PDFs, and SQL seeds) onto translation
// keys consumed by the localized UI. Keeping the canonical English in
// `lib/pricing.ts` lets server-side code (PDFs, receipts, admin emails) keep
// rendering predictable English, while the customer-facing UI looks up the
// matching i18n key here.

import type { AddOnSlug } from './pricing';

/** Maps the English `feature.label` strings declared in {@link TIERS} onto
 * `pricing.feat_*` translation keys shared with PricingTable. */
export const TIER_FEATURE_KEYS: Record<string, string> = {
  'Florida filing fee included': 'feat_floridaFee',
  'Articles of Organization / Incorporation prepared & submitted': 'feat_articles',
  'Same-business-day filing': 'feat_sameDay',
  'Same-business-day preparation and submission': 'feat_sameDayPrep',
  'Free Year-1 Registered Agent': 'feat_freeRA',
  'Email support': 'feat_emailSupport',
  'EIN Acquisition (IRS Form SS-4)': 'feat_ein',
  'Operating Agreement (custom)': 'feat_oa',
  'Operating Agreement (add-on)': 'feat_oaAddOn',
  'Certified Copy of Articles': 'feat_certCopy',
  'Certificate of Status (state-issued)': 'feat_certStatus',
  'Email + Live Chat support': 'feat_chatSupport',
  'Free .com domain': 'feat_domain',
  'Free .com domain (year 1)': 'feat_domainConcierge',
  'Annual Compliance Service': 'feat_compliance',
  'Compliance Alerts Plus (year 1)': 'feat_complianceAlerts',
  'Priority phone + chat support': 'feat_phoneSupport',
  'S-Corp Election guidance': 'feat_scorp',
  'Banking resolution template': 'feat_banking',
  'Business email setup': 'feat_email',
  'Quarterly compliance check-ins': 'feat_quarterly',
  'Everything in Basic Filing': 'feat_everythingBasic',
  'Everything in Bank-Ready Filing': 'feat_everythingBankReady',
};

/** Wizard-namespaced translation key for an add-on's display name. */
export function addOnNameKey(slug: AddOnSlug): string {
  return `addOnName_${slug}`;
}

/** Wizard-namespaced translation key for an add-on's description. */
export function addOnDescKey(slug: AddOnSlug): string {
  return `addOnDesc_${slug}`;
}

/** Wizard-namespaced translation key for an add-on's badge (e.g. "Free Year 1"). */
export function addOnBadgeKey(slug: AddOnSlug): string | null {
  if (slug === 'registered_agent') return 'addOnBadge_freeYear1';
  return null;
}

/** Wizard-namespaced translation key for a recurring cadence label. */
export function recurringKey(recurring?: 'annually' | 'monthly'): string | null {
  if (recurring === 'annually') return 'recurringAnnually';
  if (recurring === 'monthly') return 'recurringMonthly';
  return null;
}
