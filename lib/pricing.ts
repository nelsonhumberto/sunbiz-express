// Pricing catalog for LaunchForma formation packages and add-ons.
//
// Customer-facing pricing model: the customer ALWAYS sees a single all-in
// number per tier, but that number is now state-aware. Each tier carries a
// {@link TierDef.serviceMarginCents} (LaunchForma's labor charge - the same
// across states) and bundles in the actual government fees for the chosen
// state and entity type. Wyoming has lower formation fees than Florida, so
// the customer sees a lower headline price; Delaware has higher certificate
// fees, so packages that bundle certificates (Standard / Premium) cost more
// in DE than in FL. EIN, Operating Agreement, domain, and the other federal
// or service-only items stay flat - they have no state-fee component.
//
// Internally, every transaction still splits into:
//
//   - governmentRemittanceCents : amount we forward to the Secretary of
//     State (or IRS).
//   - incServicesRevenueCents   : margin retained by LaunchForma.
//
// All values are in cents.

import {
  FORMATION_STATES,
  annualComplianceFor,
  bindRaRenewalPriceCents,
  certificateOfStatusFeeCents,
  certifiedCopyFeeCents,
  defaultProcessingOption,
  resolveProcessingOption,
  stateFilingFeeCents,
  type StateCode,
} from './formation-states';

export type TierSlug = 'BASIC' | 'STANDARD' | 'PREMIUM';
export type EntityType = 'LLC' | 'CORP';

/**
 * State-fee add-ons that a tier bundles in. These drive the per-state
 * package price - Standard and Premium include a Certificate of Status and
 * Certified Copy, both of which cost different amounts in different states.
 */
const TIER_BUNDLED_STATE_FEE_ADDONS: Record<
  TierSlug,
  readonly ('cert_status' | 'cert_copy')[]
> = {
  BASIC: [],
  STANDARD: ['cert_status', 'cert_copy'],
  PREMIUM: ['cert_status', 'cert_copy'],
};

export interface TierDef {
  slug: TierSlug;
  name: string;
  /** One-line "best for" positioning shown beneath the price. */
  bestFor: string;
  description: string;
  /**
   * LaunchForma's portion of the package price (the labor / service charge).
   * Customer-facing total = serviceMarginCents + bundled government fees for
   * the chosen state and entity type. Approved Oct 25, 2026 Florida LLC
   * all-in totals (state fees included): Essential $199, Popular $349,
   * Premium $549.
   */
  serviceMarginCents: number;
  /**
   * @deprecated - use {@link tierPackagePriceCents}. This is the Florida LLC
   * reference price, computed at module load time. Kept for callers (DB
   * seeds, snapshot writes) that haven't been state-aware-ified yet.
   */
  packagePriceCents: number;
  recommended?: boolean;
  ribbon?: string;
  features: { label: string; included: boolean; highlight?: boolean }[];
}

const TIER_DEFS: Omit<TierDef, 'packagePriceCents'>[] = [
  {
    slug: 'BASIC',
    name: 'Essential',
    bestFor: 'I only need the legal filing',
    description:
      'The legal filing, prepared and submitted by LaunchForma specialists.',
    // Oct 25, 2026. FL LLC all-in $199 = $74 service + $125 FL filing.
    // FL CORP: $74 + $70 = $144. WY: $74 + $100 = $174. DE: $74 + $110 = $184.
    serviceMarginCents: 7_400,
    features: [
      { label: 'State filing fee included', included: true, highlight: true },
      {
        label: 'Articles of Organization / Incorporation prepared & submitted',
        included: true,
      },
      { label: 'Filing within 1 business day', included: true },
      { label: 'Free Year-1 Registered Agent', included: true, highlight: true },
      { label: 'Email support', included: true },
    ],
  },
  {
    slug: 'STANDARD',
    name: 'Popular',
    bestFor: 'Best for opening a bank account',
    description: 'The formation documents banks ask for at account opening.',
    // Oct 25, 2026. FL LLC all-in $349 = $189 service + $125 + $5 + $30.
    // FL CORP: $189 + $70 + $8.75 + $8.75 = $276.50.
    // WY LLC/CORP: $189 + $100 + $25 + $30 = $344.
    // DE LLC: $189 + $110 + $50 + $50 = $399. DE CORP: $189 + $109 + $50 + $50 = $398.
    serviceMarginCents: 18_900,
    recommended: true,
    ribbon: 'Recommended',
    features: [
      { label: 'Everything in Filing Only', included: true },
      { label: 'Operating Agreement (custom)', included: true, highlight: true },
      { label: 'Certificate of Status (state-issued)', included: true },
      { label: 'Certified Copy of Articles', included: true },
      { label: 'Priority email support', included: true },
    ],
  },
  {
    slug: 'PREMIUM',
    name: 'Premium',
    bestFor: 'Best for hands-off setup',
    description: 'Popular plus year-round compliance, banking, and branding.',
    // Oct 25, 2026. FL LLC all-in $549 = $389 service + $125 + $5 + $30.
    serviceMarginCents: 38_900,
    // Top tier carries a "Premium" badge - the audit moved the "Best Value"
    // anchor to the middle (STANDARD) tier so the recommended-tier
    // psychology lines up with the margin-maximising package.
    ribbon: 'Premium',
    features: [
      { label: 'Everything in Popular', included: true },
      { label: 'Compliance Alerts Plus (year 1)', included: true, highlight: true },
      { label: 'S-Corp Election filing (Form 2553)', included: true, highlight: true },
      { label: 'Free .com domain (year 1)', included: true, highlight: true },
      { label: 'Banking resolution template', included: true },
      { label: 'Business email setup', included: true },
      { label: 'Quarterly compliance check-ins', included: true },
    ],
  },
];

/**
 * Customer-facing tier price for a given (tier, state, entity type) combo.
 * The amount = serviceMarginCents + state filing fee + bundled cert fees.
 */
export function tierPackagePriceCents(
  tier: TierSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): number {
  const def = TIER_BY_SLUG[tier];
  return def.serviceMarginCents + tierBundledStateFeeCents(tier, entityType, state);
}

/** True when the tier's state-fee line includes a certified copy and a certificate of status. */
export function tierIncludesCertificateFees(tier: TierSlug): boolean {
  const bundled = TIER_BUNDLED_STATE_FEE_ADDONS[tier];
  return bundled.includes('cert_status') && bundled.includes('cert_copy');
}

/**
 * Sum of government fees a tier bundles in for a (state, entity) pair:
 * formation filing fee plus any bundled certificate fees. Drives both the
 * customer-facing tier price and the package's government-remittance line.
 */
export function tierBundledStateFeeCents(
  tier: TierSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): number {
  let total = stateFilingFeeCents(state, entityType);
  const bundled = TIER_BUNDLED_STATE_FEE_ADDONS[tier];
  if (bundled.includes('cert_status')) {
    total += certificateOfStatusFeeCents(state, entityType);
  }
  if (bundled.includes('cert_copy')) {
    total += certifiedCopyFeeCents(state, entityType);
  }
  return total;
}

export const TIERS: TierDef[] = TIER_DEFS.map((t) => ({
  ...t,
  // Florida LLC reference price, snapshotted for DB seeds and any legacy
  // caller that still reads the static field.
  packagePriceCents: t.serviceMarginCents + tierBundledFeeForReference(t.slug),
}));

function tierBundledFeeForReference(tier: TierSlug): number {
  // Inline computation that does not depend on TIERS (avoids the temporal
  // dead zone during module init).
  const fl = FORMATION_STATES.FL;
  const bundled = TIER_BUNDLED_STATE_FEE_ADDONS[tier];
  let total = fl.fees.llcTotal;
  if (bundled.includes('cert_status')) total += fl.fees.certificateOfStatusLLC;
  if (bundled.includes('cert_copy')) total += fl.fees.certifiedCopyLLC;
  return total;
}

export const TIER_BY_SLUG: Record<TierSlug, TierDef> = TIERS.reduce(
  (acc, t) => ({ ...acc, [t.slug]: t }),
  {} as Record<TierSlug, TierDef>,
);

/** Linking an existing entity is free - revenue comes from annual report renewals. */
export const LINK_EXISTING_ENTITY_FEE_CENTS = 0;

/**
 * Our service fee for filing an annual report (EXCLUDING the state fee).
 *   Customer pays: ANNUAL_REPORT_SERVICE_FEE_CENTS + state fees
 *   FL LLC  on time: $99 + $138.75 = $237.75
 *   FL LLC  after May 1: $99 + $138.75 + $400 late fee = $637.75
 *   FL Corp on time: $99 + $150.00 = $249.00
 *   FL Corp after May 1: $99 + $150.00 + $400 late fee = $649.00
 *   The $400 is a Florida state fee, not part of the $99 service fee.
 *   WY LLC/Corp total: $99 + $60.00 minimum = $159.00 minimum
 *   DE LLC total: $99 + $300.00 = $399.00 (annual tax, no report)
 *   DE Corp total: $99 + $225.00 minimum (franchise tax min) = $324.00 minimum
 */
export const ANNUAL_REPORT_SERVICE_FEE_CENTS = 9_900; // $99.00

/**
 * Nelson approved charging Florida's $400 annual-report late fee after May 1.
 * Set this to false to stop adding the fee. The $99 service fee never includes it.
 */
export const FL_AR_LATE_FEE_ENABLED = true;

const FLORIDA_TIME_ZONE = 'America/New_York';

export interface FloridaAnnualReportStateFees {
  /** On-time Sunbiz fee. $138.75 for an LLC, $150 for a for-profit corporation. */
  filingFeeCents: number;
  /** Separate state late fee. $400 after May 1 Eastern, otherwise 0. */
  lateFeeCents: number;
  /** filingFeeCents + lateFeeCents. This is what we remit to Florida. */
  totalCents: number;
}

export interface FloridaAnnualReportStateFeeOptions {
  /** Defaults to LLC ($138.75). Corporations use the $150 Sunbiz fee. */
  entityType?: EntityType;
  /** Defaults to {@link FL_AR_LATE_FEE_ENABLED} when omitted. */
  enabled?: boolean;
}

/**
 * Calendar year, month, and day in America/New_York. Month is 1-12.
 * Sunbiz's "received after May 1" rule follows Florida's clock, not UTC.
 */
function floridaCalendarDate(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FLORIDA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Missing ${type} in Florida calendar date`);
    }
    return Number(value);
  };
  return { year: read('year'), month: read('month'), day: read('day') };
}

/** Calendar year in America/New_York. */
export function floridaEasternYear(now: Date = new Date()): number {
  return floridaCalendarDate(now).year;
}

/**
 * True when Sunbiz would assess the late fee for this report year.
 * The deadline is May 1, 11:59:59 PM Eastern of `reportYear`.
 * May 1 itself is on time. May 2 of that year is late.
 * A later calendar year is also late. A future report year is not.
 *
 * Source: https://dos.fl.gov/sunbiz/forms/fees/
 * LLC annual report $138.75, or $538.75 if received after May 1.
 * Profit corporation annual report $150.00, or $550.00 if received after May 1.
 */
function isFloridaAnnualReportLate(now: Date, reportYear: number): boolean {
  const today = floridaCalendarDate(now);
  if (today.year > reportYear) return true;
  if (today.year < reportYear) return false;
  if (today.month > 5) return true;
  if (today.month < 5) return false;
  return today.day > 1;
}

/**
 * Florida annual-report state fees for `reportYear`, received at `now`.
 * Adds a separate $400 late-fee line only when `now` in America/New_York
 * is after May 1 of that report year and {@link FL_AR_LATE_FEE_ENABLED}
 * is true. The late fee is a state fee. It is not part of our service fee.
 */
export function getFloridaAnnualReportStateFees(
  reportYear: number,
  now: Date = new Date(),
  options?: FloridaAnnualReportStateFeeOptions,
): FloridaAnnualReportStateFees {
  const entityType = options?.entityType ?? 'LLC';
  const enabled = options?.enabled ?? FL_AR_LATE_FEE_ENABLED;
  const compliance = annualComplianceFor(FORMATION_STATES.FL, entityType);
  const filingFeeCents = compliance.baseFeeCents;
  const lateFeeCents =
    enabled && isFloridaAnnualReportLate(now, reportYear) ? compliance.lateFeeCents : 0;
  return {
    filingFeeCents,
    lateFeeCents,
    totalCents: filingFeeCents + lateFeeCents,
  };
}

/**
 * Canonical Registered Agent renewal price. The single source of truth for
 * what we charge to keep RA service active for another year. Marketing,
 * checkout copy, and new signups read this constant. The price a customer
 * actually pays is snapshotted onto RegisteredAgentService.renewalPriceCents
 * at signup, so a later change here never re-prices an existing row.
 */
export const RA_RENEWAL_PRICE_CENTS = 15_000; // $150.00
bindRaRenewalPriceCents(RA_RENEWAL_PRICE_CENTS);

/** Optional Registered Agent service upsell added to annual report checkout. */
export const RA_ANNUAL_SERVICE_FEE_CENTS = RA_RENEWAL_PRICE_CENTS;
/** Checkout add-on starts off. The customer opts in; the price does not change. */
export const RA_AUTORENEW_CHECKED_BY_DEFAULT = false;

// ─── Add-on services ──────────────────────────────────────────────────────

export type AddOnSlug =
  | 'registered_agent'
  | 'ein'
  | 'operating_agreement_single'
  | 'operating_agreement_multi'
  | 'domain_com'
  | 'cert_status'
  | 'cert_copy'
  | 'annual_report_managed'
  | 's_corp_election'
  | 'compliance_alerts'
  | 'boi_filing';

export interface AddOnDef {
  slug: AddOnSlug;
  name: string;
  description: string;
  /**
   * LaunchForma service component (cents). For non-state-fee add-ons (EIN,
   * Operating Agreement, domain, etc.) this IS the customer price - federal
   * services don't depend on state. For state-fee add-ons (cert_status,
   * cert_copy) the customer pays this PLUS the per-state government fee.
   */
  serviceMarginCents: number;
  /**
   * @deprecated - Florida-LLC reference price. For non-state-fee add-ons
   * this equals {@link serviceMarginCents}; for state-fee add-ons it's the
   * historical FL LLC price. Use {@link addOnPriceCents} with state + entity
   * for an accurate quote.
   */
  priceCents: number;
  recurring?: 'annually' | 'monthly';
  category: 'formation' | 'compliance' | 'branding';
  iconKey: string; // lucide icon name
  badge?: string;
  highlight?: boolean;
  /** True if this add-on triggers a per-state government fee on top of the service margin. */
  hasStateFee?: boolean;
  /**
   * Where the add-on is sold. 'dashboard': only after formation, from the
   * customer dashboard (Google Ads restricts advertising EIN services, so EIN
   * never appears in the wizard or on public pages). 'retired': no longer
   * sold, kept so historical orders still resolve. Default: 'wizard'.
   */
  availability?: 'wizard' | 'dashboard' | 'retired';
}

const ADD_ON_DEFS: Omit<AddOnDef, 'priceCents'>[] = [
  {
    slug: 'registered_agent',
    name: 'Registered Agent Service',
    description:
      'Year-1 free. In-state physical address provided, legal mail scanned, your home address kept off the public record.',
    serviceMarginCents: 0,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'ShieldCheck',
    badge: 'Free Year 1',
    highlight: true,
  },
  {
    slug: 'ein',
    name: 'EIN Application & Filing',
    description:
      'We prepare and file IRS Form SS-4 for your formed company and upload your EIN confirmation letter to your dashboard. The IRS issues EINs at no cost if you apply yourself at irs.gov; our fee covers the preparation and filing service.',
    serviceMarginCents: 7_900,
    category: 'formation',
    iconKey: 'Hash',
    availability: 'dashboard',
  },
  {
    slug: 'operating_agreement_single',
    name: 'Operating Agreement (Single-Member)',
    description:
      'State-tailored agreement defining ownership, governance, and succession - required by most banks at account opening.',
    serviceMarginCents: 8_900,
    category: 'formation',
    iconKey: 'FileText',
  },
  {
    slug: 'operating_agreement_multi',
    name: 'Operating Agreement (Multi-Member)',
    description:
      'Custom agreement covering profit allocation, voting rights, capital calls, transfer restrictions, and dispute resolution.',
    serviceMarginCents: 14_900,
    category: 'formation',
    iconKey: 'Users',
  },
  {
    slug: 'domain_com',
    name: '.com Domain Registration',
    description:
      'Secure your online identity. Includes WHOIS privacy and free DNS management.',
    serviceMarginCents: 1_900,
    recurring: 'annually',
    category: 'branding',
    iconKey: 'Globe',
  },
  {
    slug: 'cert_status',
    name: 'Certificate of Status',
    description:
      'We pay the state\'s certificate fee, request the document, and email it to you the moment it lands.',
    // $34 service margin. FL LLC: $5 + $34 = $39. WY: $25 + $34 = $59. DE: $50 + $34 = $84.
    serviceMarginCents: 3_400,
    category: 'formation',
    iconKey: 'Award',
    hasStateFee: true,
  },
  {
    slug: 'cert_copy',
    name: 'Certified Copy',
    description:
      'State-certified copy of your filed Articles. We pay the state fee and deliver the certified PDF for banks and lenders.',
    // $29 service margin. FL LLC: $30 + $29 = $59. WY: $30 + $29 = $59. DE: $50 + $29 = $79.
    serviceMarginCents: 2_900,
    category: 'formation',
    iconKey: 'FileCheck',
    hasStateFee: true,
  },
  {
    slug: 'annual_report_managed',
    name: 'Managed Annual Report',
    description:
      'We file your annual report on time - every year. Avoid non-waivable late penalties automatically.',
    serviceMarginCents: 14_900,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'CalendarCheck',
  },
  {
    slug: 's_corp_election',
    name: 'S-Corp Election (Form 2553)',
    description:
      'Tax classification change. Pre-fills shareholder consents and provides mail-in instructions to the IRS.',
    serviceMarginCents: 9_900,
    category: 'compliance',
    iconKey: 'Receipt',
  },
  {
    slug: 'compliance_alerts',
    name: 'Compliance Alerts Plus',
    description:
      'Year-round deadline tracking - annual reports, license renewals, and sales-tax filings.',
    serviceMarginCents: 9_900,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'BellRing',
  },
  {
    // Retired: FinCEN's August 2026 final rule exempts every U.S.-formed
    // company from BOI reporting, so there is nothing to sell. Kept in the
    // catalog only so historical orders still resolve.
    slug: 'boi_filing',
    name: 'BOI Filing (FinCEN)',
    description: 'Beneficial Ownership Information report (retired service).',
    serviceMarginCents: 4_900,
    category: 'compliance',
    iconKey: 'Landmark',
    availability: 'retired',
  },
];

export const ADD_ONS: AddOnDef[] = ADD_ON_DEFS.map((a) => ({
  ...a,
  // Florida LLC reference price (snapshot used by DB seeds + any caller that
  // doesn't yet pass state/entity). For federal services this just equals
  // serviceMarginCents.
  priceCents: a.serviceMarginCents + addOnReferenceRemittanceCents(a.slug, !!a.hasStateFee),
}));

function addOnReferenceRemittanceCents(
  slug: AddOnSlug,
  hasStateFee: boolean,
): number {
  if (!hasStateFee) return 0;
  if (slug === 'cert_status') return FORMATION_STATES.FL.fees.certificateOfStatusLLC;
  if (slug === 'cert_copy') return FORMATION_STATES.FL.fees.certifiedCopyLLC;
  return 0;
}

export const ADD_ON_BY_SLUG: Record<AddOnSlug, AddOnDef> = ADD_ONS.reduce(
  (acc, a) => ({ ...acc, [a.slug]: a }),
  {} as Record<AddOnSlug, AddOnDef>,
);

export interface PriceParts {
  /** LaunchForma service fee, in cents. */
  serviceCents: number;
  /** Government fee bundled into this price, in cents. Zero for service-only items. */
  stateFeeCents: number;
  /** serviceCents + stateFeeCents. Must match the existing customer total. */
  totalCents: number;
}

/**
 * Itemized tier price. The total matches {@link tierPackagePriceCents};
 * this only splits that total into the service fee and the state fee.
 */
export function tierPriceParts(
  tier: TierSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): PriceParts {
  const serviceCents = TIER_BY_SLUG[tier].serviceMarginCents;
  const stateFeeCents = tierBundledStateFeeCents(tier, entityType, state);
  return { serviceCents, stateFeeCents, totalCents: serviceCents + stateFeeCents };
}

/**
 * Itemized add-on price. State-fee add-ons (certificate handling) split into
 * service fee + state fee. Service-only add-ons return a zero state fee.
 * The total matches {@link addOnPriceCents}.
 */
export function addOnPriceParts(
  slug: AddOnSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): PriceParts {
  const def = ADD_ON_BY_SLUG[slug];
  if (!def) return { serviceCents: 0, stateFeeCents: 0, totalCents: 0 };
  const stateFeeCents = def.hasStateFee
    ? addOnGovernmentRemittanceCents(slug, entityType, state)
    : 0;
  return {
    serviceCents: def.serviceMarginCents,
    stateFeeCents,
    totalCents: def.serviceMarginCents + stateFeeCents,
  };
}

/** True when the add-on is sold in the formation wizard and on public pages. */
export function isWizardAddOn(slug: string): boolean {
  const def = ADD_ON_BY_SLUG[slug as AddOnSlug];
  return !!def && (def.availability ?? 'wizard') === 'wizard';
}

/** Add-ons offered in the formation wizard and listed on public pages. */
export const WIZARD_ADD_ONS: AddOnDef[] = ADD_ONS.filter((a) => isWizardAddOn(a.slug));

// ─── State filing fees & remittance helpers (internal accounting) ─────────

/**
 * State filing fee for the formation document, in cents. Defaults to FL
 * when no state is provided so callers that haven't been state-aware-ified
 * yet keep working.
 */
export function stateFilingFee(
  entityType: EntityType,
  state: StateCode = 'FL',
): number {
  return stateFilingFeeCents(state, entityType);
}

/**
 * Customer-facing add-on price for a given (state, entity) combo. Federal
 * services (EIN, OA, domain) return a flat number; state-fee add-ons add
 * the state's per-entity government fee on top of LaunchForma's service
 * margin so the customer sees one accurate all-in number.
 */
export function addOnPriceCents(
  slug: AddOnSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): number {
  const def = ADD_ON_BY_SLUG[slug];
  if (!def) return 0;
  if (!def.hasStateFee) return def.serviceMarginCents;
  return (
    def.serviceMarginCents +
    addOnGovernmentRemittanceCents(slug, entityType, state)
  );
}

/**
 * Government remittance for an add-on (the slice of the price we forward
 * to the Secretary of State). Used for cover-letter math and revenue
 * reporting - never shown to customers. Falls back to Florida fees when no
 * state is provided.
 */
export function addOnGovernmentRemittanceCents(
  slug: AddOnSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): number {
  if (slug === 'cert_status') return certificateOfStatusFeeCents(state, entityType);
  if (slug === 'cert_copy') return certifiedCopyFeeCents(state, entityType);
  return 0;
}

/**
 * Customer-facing tier package price (single number, includes state fee).
 * Defaults to Florida + LLC for legacy callers.
 */
export function packagePriceCents(
  tier: TierSlug,
  entityType: EntityType,
  state: StateCode = 'FL',
): number {
  return tierPackagePriceCents(tier, entityType, state);
}

// ─── Operating Agreement entitlement ──────────────────────────────────────

export function filingHasOperatingAgreement(args: {
  tier: TierSlug;
  addOnSlugs: AddOnSlug[];
  memberCount?: number;
}): boolean {
  if (args.tier === 'STANDARD' || args.tier === 'PREMIUM') return true;
  return (
    args.addOnSlugs.includes('operating_agreement_single') ||
    args.addOnSlugs.includes('operating_agreement_multi')
  );
}

/**
 * Pick the correct Operating Agreement add-on slug for a given member count.
 * Used by the wizard add-ons step to surface the right card.
 */
export function preferredOperatingAgreementSlug(memberCount: number): AddOnSlug {
  return memberCount > 1 ? 'operating_agreement_multi' : 'operating_agreement_single';
}

// ─── Cost calculation ─────────────────────────────────────────────────────

export interface CostBreakdownLine {
  /** Stable identifier for analytics/UI keying. */
  key: string;
  label: string;
  /** Optional subtitle shown beneath the label. */
  detail?: string;
  /** Customer-facing amount on this line. */
  cents: number;
  /** UI category - packages and add-ons render side-by-side. */
  category: 'package' | 'addon' | 'processing';
  /** Recurring marker for add-ons sold as annual subscriptions. */
  recurring?: 'annually' | 'monthly';
  /** Tier slug for package lines (helps consumers without a separate lookup). */
  tierSlug?: TierSlug;
  /** Add-on slug for add-on lines. */
  addOnSlug?: AddOnSlug;
  /** Processing option id for processing-fee lines. */
  processingOptionId?: string;
}

export interface CostBreakdown {
  /** Customer-facing line items. */
  lines: CostBreakdownLine[];
  /** Customer-facing tier package amount. */
  packageCents: number;
  /** Customer-facing add-ons subtotal. */
  addOnsCents: number;
  /** Customer total. */
  totalCents: number;
  /** Internal - total amount remitted to the state (filing + cert + processing). */
  governmentRemittanceCents: number;
  /** Internal - LaunchForma revenue retained from this filing. */
  incServicesRevenueCents: number;
  /** Internal - package margin only (totalCents minus state pass-through on the package). */
  packageMarginCents: number;
  /** Internal - net add-on revenue (add-ons total minus their state pass-through). */
  addOnsRevenueCents: number;

  // ── Legacy aliases (keep callers compiling). ──
  /** @deprecated Equivalent to {@link governmentRemittanceCents}. */
  stateSubtotalCents: number;
  /** @deprecated Equivalent to {@link incServicesRevenueCents}. */
  serviceSubtotalCents: number;
}

export function computeCost(input: {
  entityType: EntityType;
  tier: TierSlug;
  addOnSlugs: AddOnSlug[];
  /** Defaults to FL for backwards compatibility with pre-multi-state callers. */
  state?: StateCode;
  /**
   * Customer-selected processing-speed option id (per state).
   * Defaults to the state's default option (typically "standard").
   */
  processingOptionId?: string | null;
}): CostBreakdown {
  const tier = TIER_BY_SLUG[input.tier];
  const stateCode: StateCode = input.state ?? 'FL';
  const stateRule = FORMATION_STATES[stateCode];
  const lines: CostBreakdownLine[] = [];

  const packageCents = tierPackagePriceCents(input.tier, input.entityType, stateCode);
  const packageRemittance = tierBundledStateFeeCents(
    input.tier,
    input.entityType,
    stateCode,
  );
  const packageMargin = packageCents - packageRemittance;

  const packageLabel = `${tier.name} - ${stateRule.name} ${input.entityType === 'LLC' ? 'LLC' : 'Corporation'}`;
  lines.push({
    key: `package:${tier.slug}`,
    label: packageLabel,
    detail: `Includes the required ${stateRule.name} filing fee.`,
    cents: packageCents,
    category: 'package',
    tierSlug: tier.slug,
  });

  let addOnsCents = 0;
  let addOnsRemittance = 0;
  for (const slug of input.addOnSlugs) {
    const addOn = ADD_ON_BY_SLUG[slug];
    if (!addOn) continue;
    if (slug === 'registered_agent') continue; // free year 1
    // Dashboard-only and retired add-ons are never part of formation checkout.
    if (!isWizardAddOn(slug)) continue;
    if (isBundledIntoTier(slug, input.tier)) continue;

    const cents = addOnPriceCents(slug, input.entityType, stateCode);
    const remit = addOnGovernmentRemittanceCents(slug, input.entityType, stateCode);
    addOnsCents += cents;
    addOnsRemittance += remit;
    lines.push({
      key: `addon:${slug}`,
      label: addOn.name,
      detail: addOn.recurring ? `${addOn.recurring} subscription` : undefined,
      cents,
      category: 'addon',
      recurring: addOn.recurring,
      addOnSlug: slug,
    });
  }

  // Customer-selected processing speed. If the option is the state's default
  // (typically "standard" / $0) we don't add a line - keeps the breakdown
  // tidy. Non-default options are billed as a pass-through state expedite
  // fee on top of the package.
  const processing = resolveProcessingOption(stateCode, input.processingOptionId);
  const defaultProcessing = defaultProcessingOption(stateCode);
  let processingCents = 0;
  let processingRemittance = 0;
  if (processing.id !== defaultProcessing.id && processing.feeCents > 0) {
    processingCents = processing.feeCents;
    processingRemittance = processing.feeCents; // 100% pass-through.
    const provisional = processing.feeIsProvisional
      ? ' (provisional - confirmed at submission)'
      : '';
    lines.push({
      key: `processing:${processing.id}`,
      label: `${processing.label} (${stateRule.name})`,
      detail: `${processing.estimate} · state expedite fee${provisional}`,
      cents: processingCents,
      category: 'processing',
      processingOptionId: processing.id,
    });
  }

  const governmentRemittanceCents =
    packageRemittance + addOnsRemittance + processingRemittance;
  const totalCents = packageCents + addOnsCents + processingCents;
  const addOnsRevenueCents = addOnsCents - addOnsRemittance;
  const packageMarginCents = packageMargin;
  // Processing fees are 100% pass-through, so they contribute $0 to revenue.
  const incServicesRevenueCents = packageMarginCents + addOnsRevenueCents;

  return {
    lines,
    packageCents,
    addOnsCents,
    totalCents,
    governmentRemittanceCents,
    incServicesRevenueCents,
    packageMarginCents,
    addOnsRevenueCents,
    stateSubtotalCents: governmentRemittanceCents,
    serviceSubtotalCents: incServicesRevenueCents,
  };
}

/**
 * Returns true if the add-on is already covered by the customer's tier and
 * therefore must not be billed again à la carte. Mirrors the inclusion logic
 * declared in {@link TIERS}.
 */
function isBundledIntoTier(slug: AddOnSlug, tier: TierSlug): boolean {
  if (
    (slug === 'operating_agreement_single' || slug === 'operating_agreement_multi') &&
    (tier === 'STANDARD' || tier === 'PREMIUM')
  ) {
    return true;
  }
  if (slug === 'cert_copy' && (tier === 'STANDARD' || tier === 'PREMIUM')) return true;
  if (slug === 'cert_status' && (tier === 'STANDARD' || tier === 'PREMIUM')) return true;
  if (slug === 'domain_com' && tier === 'PREMIUM') return true;
  if (slug === 'compliance_alerts' && tier === 'PREMIUM') return true;
  // S-Corp election is now included in the Premium tier (audit fix - 
  // surfaces it as an explicit perk to justify the price gap).
  if (slug === 's_corp_election' && tier === 'PREMIUM') return true;
  return false;
}

export function effectiveAddOns(tier: TierSlug, all: AddOnSlug[]): AddOnSlug[] {
  return all.filter((slug) => !isBundledIntoTier(slug, tier));
}

export function tierBundledAddOns(tier: TierSlug): AddOnSlug[] {
  if (tier === 'BASIC') return ['registered_agent'];
  if (tier === 'STANDARD')
    return ['registered_agent', 'operating_agreement_single', 'cert_copy', 'cert_status'];
  return [
    'registered_agent',
    'operating_agreement_single',
    'cert_copy',
    'cert_status',
    'domain_com',
    'compliance_alerts',
    's_corp_election',
  ];
}
