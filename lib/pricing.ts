// Pricing catalog for IncServices formation packages and add-ons.
//
// Customer-facing pricing model: ONE all-in package price per tier (no
// itemized "+ state fee" math at the surface). Internally we still split each
// transaction into two ledgers:
//
//   - governmentRemittanceCents : amount we forward to Florida (or IRS).
//   - incServicesRevenueCents   : the rest — margin retained by IncServices.
//
// All values are in cents.

import { FL } from './florida';

export type TierSlug = 'BASIC' | 'STANDARD' | 'PREMIUM';
export type EntityType = 'LLC' | 'CORP';

export interface TierDef {
  slug: TierSlug;
  name: string;
  /** One-line "best for" positioning shown beneath the price. */
  bestFor: string;
  description: string;
  /**
   * All-in package price. The package already covers Florida's filing fee
   * and IncServices' preparation/submission work. We charge the same price
   * regardless of entity type so the customer sees a single confident
   * number; the LLC vs Corp margin difference is absorbed internally.
   */
  packagePriceCents: number;
  recommended?: boolean;
  ribbon?: string;
  features: { label: string; included: boolean; highlight?: boolean }[];
}

export const TIERS: TierDef[] = [
  {
    slug: 'BASIC',
    name: 'Basic Filing',
    bestFor: 'I only need the legal filing',
    description: 'The legal filing, prepared and submitted by Florida specialists.',
    packagePriceCents: 15_500,
    features: [
      { label: 'Florida filing fee included', included: true, highlight: true },
      { label: 'Articles of Organization / Incorporation prepared & submitted', included: true },
      { label: 'Same-business-day filing', included: true },
      { label: 'Free Year-1 Registered Agent', included: true, highlight: true },
      { label: 'Email support', included: true },
      { label: 'EIN Acquisition (IRS Form SS-4)', included: false },
      { label: 'Operating Agreement (custom)', included: false },
      { label: 'Compliance reminders', included: false },
      { label: 'Free .com domain', included: false },
    ],
  },
  {
    slug: 'STANDARD',
    name: 'Bank-Ready Filing',
    bestFor: 'Best for opening a bank account',
    description: 'Everything banks ask for at account opening — handled.',
    packagePriceCents: 29_900,
    recommended: true,
    ribbon: 'Most Popular',
    features: [
      { label: 'Everything in Basic Filing', included: true },
      { label: 'EIN Acquisition (IRS Form SS-4)', included: true, highlight: true },
      { label: 'Operating Agreement (custom)', included: true, highlight: true },
      { label: 'Certificate of Status (state-issued)', included: true, highlight: true },
      { label: 'Certified Copy of Articles', included: true, highlight: true },
      { label: 'Email + Live Chat support', included: true },
      { label: 'Free .com domain', included: false },
      { label: 'Annual Compliance Service', included: false },
    ],
  },
  {
    slug: 'PREMIUM',
    name: 'Launch Concierge',
    bestFor: 'Best for hands-off setup',
    description: 'Bank-Ready plus year-round compliance, banking, and branding.',
    packagePriceCents: 49_900,
    ribbon: 'Best Value',
    features: [
      { label: 'Everything in Bank-Ready Filing', included: true },
      { label: 'Compliance Alerts Plus (year 1)', included: true, highlight: true },
      { label: 'Free .com domain (year 1)', included: true, highlight: true },
      { label: 'Priority phone + chat support', included: true },
      { label: 'S-Corp Election guidance', included: true },
      { label: 'Banking resolution template', included: true },
      { label: 'Business email setup', included: true },
      { label: 'Quarterly compliance check-ins', included: true },
    ],
  },
];

export const TIER_BY_SLUG: Record<TierSlug, TierDef> = TIERS.reduce(
  (acc, t) => ({ ...acc, [t.slug]: t }),
  {} as Record<TierSlug, TierDef>
);

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
  | 'compliance_alerts';

export interface AddOnDef {
  slug: AddOnSlug;
  name: string;
  description: string;
  /** Customer-facing price. Same price across LLC and Corp. */
  priceCents: number;
  recurring?: 'annually' | 'monthly';
  category: 'formation' | 'compliance' | 'branding';
  iconKey: string; // lucide icon name
  badge?: string;
  highlight?: boolean;
  /**
   * If this add-on triggers a state-side fee, we forward this amount to
   * Florida and keep the rest as service margin. Looked up per entity type
   * via {@link addOnGovernmentRemittanceCents}.
   */
  remittance?: { LLC: number; CORP: number };
}

export const ADD_ONS: AddOnDef[] = [
  {
    slug: 'registered_agent',
    name: 'Registered Agent Service',
    description:
      'Year-1 free. Florida physical address provided, legal mail scanned, your home address kept off the public record.',
    priceCents: 0,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'ShieldCheck',
    badge: 'Free Year 1',
    highlight: true,
  },
  {
    slug: 'ein',
    name: 'EIN Acquisition',
    description:
      'IRS Form SS-4 filed for you — federal Tax ID delivered within 1 business day. Required to open a business bank account.',
    priceCents: 7_900,
    category: 'formation',
    iconKey: 'Hash',
  },
  {
    slug: 'operating_agreement_single',
    name: 'Operating Agreement (Single-Member)',
    description:
      'Florida-tailored agreement defining ownership, governance, and succession — required by most banks at account opening.',
    priceCents: 8_900,
    category: 'formation',
    iconKey: 'FileText',
  },
  {
    slug: 'operating_agreement_multi',
    name: 'Operating Agreement (Multi-Member)',
    description:
      'Custom agreement covering profit allocation, voting rights, capital calls, transfer restrictions, and dispute resolution.',
    priceCents: 14_900,
    category: 'formation',
    iconKey: 'Users',
  },
  {
    slug: 'domain_com',
    name: '.com Domain Registration',
    description:
      'Secure your online identity. Includes WHOIS privacy and free DNS management.',
    priceCents: 1_900,
    recurring: 'annually',
    category: 'branding',
    iconKey: 'Globe',
  },
  {
    slug: 'cert_status',
    name: 'Certificate of Status Handling',
    description:
      'We pay Florida the certificate fee, request the document, and email it to you the moment it lands.',
    priceCents: 3_900,
    category: 'formation',
    iconKey: 'Award',
    remittance: {
      LLC: FL.fees.certificateOfStatusLLC,
      CORP: FL.fees.certificateOfStatusCorp,
    },
  },
  {
    slug: 'cert_copy',
    name: 'Certified Copy Handling',
    description:
      'State-certified copy of your filed Articles. We pay the state fee and deliver the certified PDF for banks and lenders.',
    priceCents: 5_900,
    category: 'formation',
    iconKey: 'FileCheck',
    remittance: {
      LLC: FL.fees.certifiedCopyLLC,
      CORP: FL.fees.certifiedCopyCorp,
    },
  },
  {
    slug: 'annual_report_managed',
    name: 'Managed Annual Report',
    description:
      'We file your Florida annual report on time — every year. Avoid the $400 non-waivable late penalty automatically.',
    priceCents: 14_900,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'CalendarCheck',
  },
  {
    slug: 's_corp_election',
    name: 'S-Corp Election (Form 2553)',
    description:
      'Tax classification change. Pre-fills shareholder consents and provides mail-in instructions to the IRS.',
    priceCents: 9_900,
    category: 'compliance',
    iconKey: 'Receipt',
  },
  {
    slug: 'compliance_alerts',
    name: 'Compliance Alerts Plus',
    description:
      'Year-round deadline tracking — annual reports, license renewals, BOI reports, sales-tax filings.',
    priceCents: 9_900,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'BellRing',
  },
];

export const ADD_ON_BY_SLUG: Record<AddOnSlug, AddOnDef> = ADD_ONS.reduce(
  (acc, a) => ({ ...acc, [a.slug]: a }),
  {} as Record<AddOnSlug, AddOnDef>
);

// ─── State filing fees & remittance helpers (internal accounting) ─────────

export function stateFilingFee(entityType: EntityType): number {
  return entityType === 'LLC' ? FL.fees.llcTotal : FL.fees.corpTotal;
}

/**
 * Customer-facing add-on price. Flat across LLC and Corp — internal state
 * fee differences are absorbed in the IncServices margin.
 */
export function addOnPriceCents(slug: AddOnSlug, _entityType: EntityType): number {
  return ADD_ON_BY_SLUG[slug]?.priceCents ?? 0;
}

/**
 * Government remittance for an add-on (the slice of the price we forward
 * to Florida). Used for cover-letter math and revenue reporting — never
 * shown to customers.
 */
export function addOnGovernmentRemittanceCents(
  slug: AddOnSlug,
  entityType: EntityType,
): number {
  const def = ADD_ON_BY_SLUG[slug];
  if (!def?.remittance) return 0;
  return entityType === 'LLC' ? def.remittance.LLC : def.remittance.CORP;
}

/**
 * Customer-facing tier package price (single number, includes Florida fee).
 */
export function packagePriceCents(tier: TierSlug, _entityType: EntityType): number {
  return TIER_BY_SLUG[tier].packagePriceCents;
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
  /** UI category — packages and add-ons render side-by-side. */
  category: 'package' | 'addon';
  /** Recurring marker for add-ons sold as annual subscriptions. */
  recurring?: 'annually' | 'monthly';
  /** Tier slug for package lines (helps consumers without a separate lookup). */
  tierSlug?: TierSlug;
  /** Add-on slug for add-on lines. */
  addOnSlug?: AddOnSlug;
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
  /** Internal — total amount remitted to Florida (filing fee + cert fees). */
  governmentRemittanceCents: number;
  /** Internal — IncServices revenue retained from this filing. */
  incServicesRevenueCents: number;
  /** Internal — package margin only (totalCents minus state pass-through on the package). */
  packageMarginCents: number;
  /** Internal — net add-on revenue (add-ons total minus their state pass-through). */
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
}): CostBreakdown {
  const tier = TIER_BY_SLUG[input.tier];
  const lines: CostBreakdownLine[] = [];

  const packageCents = packagePriceCents(input.tier, input.entityType);
  const stateFee = stateFilingFee(input.entityType);
  const packageRemittance = stateFee;
  const packageMargin = packageCents - packageRemittance;

  const packageLabel = `${tier.name} — Florida ${input.entityType === 'LLC' ? 'LLC' : 'Corporation'}`;
  lines.push({
    key: `package:${tier.slug}`,
    label: packageLabel,
    detail: 'Includes the required Florida filing fee.',
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
    if (isBundledIntoTier(slug, input.tier)) continue;

    const cents = addOnPriceCents(slug, input.entityType);
    const remit = addOnGovernmentRemittanceCents(slug, input.entityType);
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

  const governmentRemittanceCents = packageRemittance + addOnsRemittance;
  const totalCents = packageCents + addOnsCents;
  const addOnsRevenueCents = addOnsCents - addOnsRemittance;
  const packageMarginCents = packageMargin;
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
    // Legacy mirrors.
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
  if (slug === 'ein' && (tier === 'STANDARD' || tier === 'PREMIUM')) return true;
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
  return false;
}

export function effectiveAddOns(tier: TierSlug, all: AddOnSlug[]): AddOnSlug[] {
  return all.filter((slug) => !isBundledIntoTier(slug, tier));
}

export function tierBundledAddOns(tier: TierSlug): AddOnSlug[] {
  if (tier === 'BASIC') return ['registered_agent'];
  if (tier === 'STANDARD')
    return ['registered_agent', 'ein', 'operating_agreement_single', 'cert_copy', 'cert_status'];
  return [
    'registered_agent',
    'ein',
    'operating_agreement_single',
    'cert_copy',
    'cert_status',
    'domain_com',
    'compliance_alerts',
  ];
}
