// Pricing catalog for formation tiers and add-ons.
// All values in cents. Mirrors the pricing structure from the handoff docs.

import { FL } from './florida';

export type TierSlug = 'BASIC' | 'STANDARD' | 'PREMIUM';
export type EntityType = 'LLC' | 'CORP';

export interface TierDef {
  slug: TierSlug;
  name: string;
  description: string;
  basePriceCents: number;
  recommended?: boolean;
  ribbon?: string;
  features: { label: string; included: boolean; highlight?: boolean }[];
}

export const TIERS: TierDef[] = [
  {
    slug: 'BASIC',
    name: 'Starter',
    description: 'Just the essentials — file your business with the state.',
    basePriceCents: 0,
    features: [
      { label: 'Articles of Organization / Incorporation', included: true },
      { label: 'State filing submitted same business day', included: true },
      { label: 'Free Year-1 Registered Agent', included: true, highlight: true },
      { label: 'Email support', included: true },
      { label: 'EIN Acquisition (IRS Form SS-4)', included: false },
      { label: 'Operating Agreement', included: false },
      { label: 'Compliance reminders', included: false },
      { label: 'Free .com domain', included: false },
    ],
  },
  {
    slug: 'STANDARD',
    name: 'Pro',
    description: 'Everything most owners need — including bank-account essentials.',
    basePriceCents: 9_900,
    recommended: true,
    ribbon: 'Most Popular',
    features: [
      { label: 'Everything in Starter', included: true },
      { label: 'EIN Acquisition (IRS Form SS-4)', included: true, highlight: true },
      { label: 'Operating Agreement (custom)', included: true, highlight: true },
      { label: '1 Certified Copy', included: true },
      { label: '1 Certificate of Status', included: true },
      { label: '1-day expedited processing', included: true },
      { label: 'Email + Live Chat support', included: true },
      { label: 'Free .com domain', included: false },
      { label: 'Annual Compliance Service', included: false },
    ],
  },
  {
    slug: 'PREMIUM',
    name: 'Concierge',
    description: 'White-glove formation with year-round compliance + branding.',
    basePriceCents: 29_900,
    ribbon: 'Best Value',
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Free .com domain (year 1)', included: true, highlight: true },
      { label: 'Annual Compliance Service (year 1)', included: true, highlight: true },
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
  priceCents: number;
  recurring?: 'annually' | 'monthly';
  category: 'formation' | 'compliance' | 'branding';
  iconKey: string; // lucide icon name
  badge?: string;
  highlight?: boolean;
}

export const ADD_ONS: AddOnDef[] = [
  {
    slug: 'registered_agent',
    name: 'Registered Agent Service',
    description:
      'Year-1 free. Maintains your Florida physical address, scans incoming legal mail, and keeps your home address private.',
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
      'IRS Form SS-4 filed on your behalf — receive your federal Tax ID within 1 business day. Required to open a business bank account.',
    priceCents: 4_900,
    category: 'formation',
    iconKey: 'Hash',
  },
  {
    slug: 'operating_agreement_single',
    name: 'Operating Agreement (Single-Member)',
    description:
      'Florida-tailored agreement defining ownership, governance, and succession — required by most banks at account opening.',
    priceCents: 4_900,
    category: 'formation',
    iconKey: 'FileText',
  },
  {
    slug: 'operating_agreement_multi',
    name: 'Operating Agreement (Multi-Member)',
    description:
      'Custom agreement covering profit allocation, voting rights, capital calls, transfer restrictions, and dispute resolution.',
    priceCents: 9_900,
    category: 'formation',
    iconKey: 'Users',
  },
  {
    slug: 'domain_com',
    name: '.com Domain Registration',
    description:
      'Secure your online identity. Includes WHOIS privacy and free DNS management.',
    priceCents: 999,
    recurring: 'annually',
    category: 'branding',
    iconKey: 'Globe',
  },
  {
    slug: 'cert_status',
    name: 'Certificate of Status',
    description:
      'Official proof your entity is in good standing. Required for many bank applications and licensing.',
    priceCents: 500,
    category: 'formation',
    iconKey: 'Award',
  },
  {
    slug: 'cert_copy',
    name: 'Certified Copy of Articles',
    description:
      'State-certified copy of your filed Articles of Organization. Required for many lender/banking applications.',
    priceCents: 3_000,
    category: 'formation',
    iconKey: 'FileCheck',
  },
  {
    slug: 'annual_report_managed',
    name: 'Managed Annual Report Filing',
    description:
      'We file your Florida annual report on time — every year. Avoid the $400 late penalty automatically.',
    priceCents: 9_900,
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
    priceCents: 19_900,
    recurring: 'annually',
    category: 'compliance',
    iconKey: 'BellRing',
  },
];

export const ADD_ON_BY_SLUG: Record<AddOnSlug, AddOnDef> = ADD_ONS.reduce(
  (acc, a) => ({ ...acc, [a.slug]: a }),
  {} as Record<AddOnSlug, AddOnDef>
);

// ─── State filing fees (snapshot) ─────────────────────────────────────────

export function stateFilingFee(entityType: EntityType): number {
  return entityType === 'LLC' ? FL.fees.llcTotal : FL.fees.corpTotal;
}

// ─── Cost calculation ─────────────────────────────────────────────────────

export interface CostBreakdownLine {
  label: string;
  detail?: string;
  cents: number;
  category: 'state' | 'service' | 'addon' | 'discount';
}

export interface CostBreakdown {
  lines: CostBreakdownLine[];
  serviceSubtotalCents: number;
  stateSubtotalCents: number;
  totalCents: number;
}

export function computeCost(input: {
  entityType: EntityType;
  tier: TierSlug;
  addOnSlugs: AddOnSlug[];
}): CostBreakdown {
  const tier = TIER_BY_SLUG[input.tier];
  const lines: CostBreakdownLine[] = [];

  // State filing
  const stateFee = stateFilingFee(input.entityType);
  lines.push({
    label: `Florida ${input.entityType === 'LLC' ? 'LLC Articles of Organization' : 'Corporation Articles of Incorporation'}`,
    detail: 'Paid directly to Florida Department of State',
    cents: stateFee,
    category: 'state',
  });

  // Service fee
  if (tier.basePriceCents > 0) {
    lines.push({
      label: `${tier.name} formation service`,
      detail: tier.description,
      cents: tier.basePriceCents,
      category: 'service',
    });
  }

  // Add-ons
  let addOnsTotal = 0;
  for (const slug of input.addOnSlugs) {
    const addOn = ADD_ON_BY_SLUG[slug];
    if (!addOn) continue;
    // Skip add-ons already included in tier
    if (slug === 'ein' && (input.tier === 'STANDARD' || input.tier === 'PREMIUM')) continue;
    if (
      (slug === 'operating_agreement_single' || slug === 'operating_agreement_multi') &&
      (input.tier === 'STANDARD' || input.tier === 'PREMIUM')
    )
      continue;
    if (slug === 'cert_copy' && (input.tier === 'STANDARD' || input.tier === 'PREMIUM')) continue;
    if (slug === 'cert_status' && (input.tier === 'STANDARD' || input.tier === 'PREMIUM')) continue;
    if (slug === 'domain_com' && input.tier === 'PREMIUM') continue;
    if (slug === 'compliance_alerts' && input.tier === 'PREMIUM') continue;

    addOnsTotal += addOn.priceCents;
    lines.push({
      label: addOn.name,
      detail: addOn.recurring ? `${addOn.recurring} subscription` : undefined,
      cents: addOn.priceCents,
      category: 'addon',
    });
  }

  const serviceSubtotal = tier.basePriceCents + addOnsTotal;
  return {
    lines,
    serviceSubtotalCents: serviceSubtotal,
    stateSubtotalCents: stateFee,
    totalCents: stateFee + serviceSubtotal,
  };
}

export function effectiveAddOns(tier: TierSlug, all: AddOnSlug[]): AddOnSlug[] {
  // Returns add-ons after removing those bundled into the tier
  return all.filter((slug) => {
    if (slug === 'ein' && (tier === 'STANDARD' || tier === 'PREMIUM')) return false;
    if (
      (slug === 'operating_agreement_single' || slug === 'operating_agreement_multi') &&
      (tier === 'STANDARD' || tier === 'PREMIUM')
    )
      return false;
    if (slug === 'cert_copy' && (tier === 'STANDARD' || tier === 'PREMIUM')) return false;
    if (slug === 'cert_status' && (tier === 'STANDARD' || tier === 'PREMIUM')) return false;
    if (slug === 'domain_com' && tier === 'PREMIUM') return false;
    if (slug === 'compliance_alerts' && tier === 'PREMIUM') return false;
    return true;
  });
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
