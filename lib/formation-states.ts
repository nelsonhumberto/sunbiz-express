// LaunchForma formation-state registry.
//
// Single source of truth for state-specific business formation rules used by
// the wizard, pricing, document generation, admin, and marketing layers.
//
// Currently active for production: Florida, Wyoming, Delaware. Adding a new
// state means adding a new entry to {@link FORMATION_STATES} and (optionally)
// custom validation in this file — no changes to the wizard UI should be
// required as long as the state matches the standard rule shape.
//
// Where a sub-rule needs special handling (e.g. Wyoming's "consent to
// electronic service" or Delaware's stock-structure dependent corp fee), the
// rule is marked here and the wizard renders an extra panel for it.
//
// IMPORTANT — fee accuracy: the dollar amounts here are remitted to the
// respective Secretary of State and feed our internal accounting + cover
// letter math. The marketing pricing presented to the customer is a single
// all-in package that absorbs differences across LLC/Corp and across states.

export type StateCode = 'FL' | 'WY' | 'DE';
export type EntityType = 'LLC' | 'CORP';

export const ACTIVE_FORMATION_STATES: readonly StateCode[] = ['FL', 'WY', 'DE'] as const;

/**
 * A group of restricted/regulated words that share a regulatory owner
 * (banking division, education department, etc.). Used to escalate names to
 * manual/admin review instead of pretending we can self-clear them.
 */
export interface RestrictedWordGroup {
  /** Unique stable id for the group ("banking", "education", "insurance"). */
  id: string;
  /** Customer-facing label used in warning copy ("Banking & trust"). */
  label: string;
  /** Words/phrases that trigger this group (lowercase, substring match). */
  words: readonly string[];
  /** Action when a customer-supplied name hits this group. */
  action: 'block' | 'manual_review';
  /** Customer-facing copy explaining why the name needs review/blocking. */
  reason: string;
}

/**
 * Pattern that flags a name as requiring paper / manual filing rather than
 * the regular online self-serve path. Used to surface a clear warning in the
 * wizard so customers (and our ops team) know the filing will take longer.
 */
export interface ManualReviewPattern {
  /** Unique id ("wy-leading-a", "wy-special-chars"). */
  id: string;
  /** Plain-language reason shown to the customer. */
  reason: string;
  /** Test function — return true if the name triggers this rule. */
  test: (trimmedName: string) => boolean;
}

export interface NameRules {
  /** Allowed entity-name suffixes. The wizard renders these in a dropdown. */
  llcSuffixes: readonly { value: string; label: string }[];
  corpSuffixes: readonly { value: string; label: string }[];
  /**
   * Words that require special regulatory approval and that we conservatively
   * block from self-service formation (banks, trust, insurance, etc.).
   * Kept for backwards compatibility — newer code should prefer
   * {@link restrictedWordGroups} which carries an action + reason.
   */
  prohibitedWords: readonly string[];
  /**
   * Tokens that are not considered distinguishable when comparing names
   * (articles, ampersand replacements, common connectors, the entity-type
   * suffix forms). Used by name-availability comparisons. Optional — falls
   * back to a sensible default when omitted.
   */
  nonDistinguishingTokens?: readonly string[];
  /**
   * State-specific patterns that route the filing to manual / paper review
   * even though the name itself is otherwise valid. Wyoming is the
   * canonical example: any name beginning with "A" or containing special
   * characters has to be paper-filed for the SoS to manually review.
   */
  manualReviewPatterns?: readonly ManualReviewPattern[];
  /**
   * Regulated word groups that escalate the filing to admin/manual review or
   * block it outright. Replaces the flat prohibitedWords list with richer
   * action/reason metadata so the wizard can show the customer what happens.
   */
  restrictedWordGroups?: readonly RestrictedWordGroup[];
  /**
   * State-specific subjective-name disclosure. Used by Delaware, where the
   * Division of Corporations may refuse names for reasons that cannot be
   * evaluated client-side (deception, public safety, abusive patterns).
   */
  subjectiveReviewNote?: string;
}

/**
 * A processing-speed option the customer can choose at filing time. Some
 * states (DE, WY) offer multiple tiers — standard is free but slow,
 * expedited is paid but fast. We always pass these through as part of the
 * remittance to the state, never as profit.
 */
export interface ProcessingOption {
  /** Stable id used in DB JSON ("standard", "expedited_24h"). */
  id: string;
  /** Customer-facing label ("Standard processing", "8-business-day"). */
  label: string;
  /** Short description used in the wizard / receipt. */
  description: string;
  /** Estimated processing time, e.g. "6 weeks", "8 business days". */
  estimate: string;
  /** Government fee (cents) on top of the base filing fee. 0 = included. */
  feeCents: number;
  /** True if this is the default selection for the state. */
  isDefault?: boolean;
  /**
   * True if the published fee is provisional pending verification at
   * submission time (we display this clearly to the customer).
   */
  feeIsProvisional?: boolean;
}

export interface FilingFees {
  /** Total cost of filing the LLC formation document, in cents. */
  llcTotal: number;
  /** Total cost of filing the Corp formation document, in cents. */
  corpTotal: number;
  /** Add-on certificate fees, in cents. Set to 0 if not offered by the state. */
  certificateOfStatusLLC: number;
  certificateOfStatusCorp: number;
  certifiedCopyLLC: number;
  certifiedCopyCorp: number;
}

export interface AnnualComplianceRule {
  entityType: EntityType;
  /**
   * Compliance kind: most states call it "Annual Report" but Delaware LLCs
   * pay an Annual Tax with no report, and Delaware corps pay a Franchise Tax.
   */
  kind: 'annual_report' | 'annual_tax' | 'franchise_tax';
  /** Customer-facing label (e.g. "Annual Report", "Annual Tax"). */
  label: string;
  /** Recurring fee in cents (minimum, when state uses tiered pricing). */
  baseFeeCents: number;
  /** Late penalty in cents (0 if state has no flat late fee). */
  lateFeeCents: number;
  /** True if state uses an asset-based or stock-based fee that may exceed base. */
  hasVariableFee?: boolean;
  /** Free-form copy for the marketing FAQ + customer dashboard. */
  description: string;
  /**
   * Anchor month/day for the deadline. Some states use the first of a fixed
   * month (FL, DE LLC = May 1, June 1); some use anniversary month (WY).
   */
  deadline:
    | { kind: 'fixed_date'; month: number; day: number }
    | { kind: 'anniversary_month_first_day' };
}

/**
 * Per-state rules governing the collection and validation of business
 * addresses on the formation document. Used by Step4 (principal place),
 * Step5 (mailing) and Step6 (registered agent) to drive copy, locking
 * behaviour, and validation.
 */
export interface AddressRules {
  /** Is a principal-place-of-business street address required at filing? */
  principalAddressRequired: boolean;
  /** True if the principal address must be a street address inside this state. */
  principalAddressMustBeInState: boolean;
  /** Is a mailing address required (separate from the principal address)? */
  mailingAddressRequired: boolean;
  /** True if the registered agent's business office must be in this state. */
  registeredAgentAddressMustBeInState: boolean;
  /** True if the registered agent must have a physical street address (no P.O. Box). */
  registeredAgentRequiresPhysicalStreet: boolean;
  /**
   * Friendly "why" copy used when an in-state requirement is enforced. Falls
   * back to a generic message when omitted.
   */
  inStateRequirementNote?: string;
}

export interface RegisteredAgentProfile {
  /** Display name shown in the wizard / on the executed document. */
  name: string;
  /** Internal officer who signs as RA on the executed Articles. */
  signingOfficerName: string;
  signingOfficerTitle: string;
  email: string;
  phone: string;
  street1: string;
  street2?: string;
  city: string;
  state: StateCode;
  zip: string;
  /** Year-1 free? Year-2+ renewal? */
  yearOneIncluded: boolean;
  renewalCents: number;
}

export interface FormationStateRule {
  code: StateCode;
  /** USPS code, lowercase slug, English/Spanish display names. */
  slug: 'florida' | 'wyoming' | 'delaware';
  name: string;
  nameEs: string;
  /** Two-letter chamber name, used in marketing chip ("FL", "WY", "DE"). */
  shortName: string;
  /** Whether real-time name search is wired up (FL only — Sunbiz API). */
  hasLiveNameSearch: boolean;
  /** Document labels used by the wizard, PDFs, and admin. */
  documentLabels: {
    llcArticles: string;
    corpArticles: string;
    coverLetter: string;
  };
  /** Statute references used in PDF copy. */
  statuteReferences: {
    llc: string;
    corp: string;
  };
  fees: FilingFees;
  addressRules: AddressRules;
  nameRules: NameRules;
  /**
   * Annual compliance rules per entity type. Most states have one per type.
   */
  annualCompliance: readonly AnnualComplianceRule[];
  /**
   * Effective-date rules: how many days back/forward from filing the customer
   * may schedule the formation date.
   */
  effectiveDate: {
    minDaysBack: number;
    /** True if minDaysBack should be interpreted as business days. */
    minDaysBackUsesBusinessDays: boolean;
    maxDaysForward: number;
  };
  /** Public links shown in wizard tooltips and FAQ answers. */
  urls: {
    /** State search/lookup page (Sunbiz, WyoBiz, DE entity search). */
    search: string;
    /** Online filing intake when the state offers it. */
    filing: string;
    /** Annual report or annual tax payment portal. */
    annualReport: string;
    /** State Secretary of State homepage. */
    homepage: string;
  };
  /** Mailing/courier address printed on the cover letter. */
  filingMailingAddress: {
    label: string;
    lines: string[];
  };
  /** Internal LaunchForma RA profile for this state. */
  registeredAgent: RegisteredAgentProfile;
  /**
   * Quirks that make the wizard render extra panels:
   *   - requiresElectronicServiceConsent (WY)
   *   - requiresParValueForCorp (DE)
   *   - requiresOrganizerEmail (WY)
   *   - corpFeeDependsOnStockStructure (DE)
   */
  quirks: {
    requiresElectronicServiceConsent?: boolean;
    requiresOrganizerEmail?: boolean;
    requiresParValueForCorp?: boolean;
    corpFeeDependsOnStockStructure?: boolean;
    /** True if filings always succeed online (no manual fallback). */
    onlineFilingOnly?: boolean;
    /** Note rendered under the wizard's state badge to manage expectations. */
    customerNote?: string;
  };
  /** Marketing trust copy: "Filed in 1 business day", "Same day", etc. */
  marketingTiming: {
    badgeKey: string;
    /** Default English copy used if the i18n key is missing. */
    badgeFallback: string;
  };
  /**
   * Customer-selectable processing options. The first entry marked
   * `isDefault: true` is what we apply to new filings; the rest are upsells
   * that surface in the wizard's optional-details step.
   */
  processingOptions: readonly ProcessingOption[];
}

// ─── Florida ──────────────────────────────────────────────────────────────

const FLORIDA_RULE: FormationStateRule = {
  code: 'FL',
  slug: 'florida',
  name: 'Florida',
  nameEs: 'Florida',
  shortName: 'FL',
  hasLiveNameSearch: true,
  documentLabels: {
    llcArticles: 'Articles of Organization',
    corpArticles: 'Articles of Incorporation',
    coverLetter: 'Cover Letter',
  },
  statuteReferences: {
    llc: 'Chapter 605, Florida Statutes',
    corp: 'Chapter 607, Florida Statutes',
  },
  fees: {
    // Articles + RA designation, per the Florida Department of State.
    llcTotal: 12_500, // $125
    corpTotal: 7_000, // $70
    certificateOfStatusLLC: 500, // $5
    certificateOfStatusCorp: 875, // $8.75
    certifiedCopyLLC: 3_000, // $30
    certifiedCopyCorp: 875, // $8.75
  },
  addressRules: {
    principalAddressRequired: true,
    principalAddressMustBeInState: false,
    mailingAddressRequired: false,
    registeredAgentAddressMustBeInState: true,
    registeredAgentRequiresPhysicalStreet: true,
    inStateRequirementNote:
      'Florida requires a registered agent with a physical Florida street address — no P.O. Box.',
  },
  nameRules: {
    llcSuffixes: [
      { value: 'LLC', label: 'LLC' },
      { value: 'L.L.C.', label: 'L.L.C.' },
      { value: 'Limited Liability Company', label: 'Limited Liability Company' },
    ],
    corpSuffixes: [
      { value: 'Corp', label: 'Corp' },
      { value: 'Corporation', label: 'Corporation' },
      { value: 'Inc', label: 'Inc' },
      { value: 'Incorporated', label: 'Incorporated' },
      { value: 'Co', label: 'Co' },
      { value: 'Company', label: 'Company' },
    ],
    prohibitedWords: [
      'bank',
      'banking',
      'banker',
      'trust',
      'savings',
      'credit union',
      'insurance',
      'university',
      'college',
    ],
    restrictedWordGroups: [
      {
        id: 'banking',
        label: 'Banking & trust',
        words: ['bank', 'banking', 'banker', 'trust', 'savings', 'credit union'],
        action: 'block',
        reason:
          'Florida requires written approval from the Office of Financial Regulation before forming a banking-related entity. Please contact us if you need this — we can route it through manual review.',
      },
      {
        id: 'insurance',
        label: 'Insurance',
        words: ['insurance', 'insurer', 'underwriters'],
        action: 'block',
        reason:
          'Insurance-related entity names require Florida Department of Financial Services pre-approval.',
      },
      {
        id: 'education',
        label: 'Education',
        words: ['university', 'college'],
        action: 'manual_review',
        reason:
          'Florida treats higher-education names cautiously — we will route this filing to manual review before submission.',
      },
    ],
  },
  annualCompliance: [
    {
      entityType: 'LLC',
      kind: 'annual_report',
      label: 'Annual Report',
      baseFeeCents: 13_875, // $138.75
      lateFeeCents: 40_000, // $400 non-waivable
      description:
        'Florida requires every LLC to file an Annual Report between January 1 and May 1 each year. The fee is $138.75; missing the May 1 deadline triggers a non-waivable $400 late fee.',
      deadline: { kind: 'fixed_date', month: 5, day: 1 },
    },
    {
      entityType: 'CORP',
      kind: 'annual_report',
      label: 'Annual Report',
      baseFeeCents: 15_000, // $150
      lateFeeCents: 40_000,
      description:
        'Florida requires every Corporation to file an Annual Report between January 1 and May 1 each year. The fee is $150; missing the May 1 deadline triggers a non-waivable $400 late fee.',
      deadline: { kind: 'fixed_date', month: 5, day: 1 },
    },
  ],
  effectiveDate: {
    minDaysBack: 5,
    minDaysBackUsesBusinessDays: true,
    maxDaysForward: 90,
  },
  urls: {
    search: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    filing: 'https://efile.sunbiz.org/llc_file.html',
    annualReport: 'https://services.sunbiz.org/Filings/AnnualReport/FilingStart',
    homepage: 'https://dos.fl.gov/sunbiz/',
  },
  filingMailingAddress: {
    label: 'Florida Department of State, Division of Corporations',
    lines: [
      'New Filing Section',
      'Division of Corporations',
      'P.O. Box 6327',
      'Tallahassee, FL 32314',
    ],
  },
  registeredAgent: {
    name: 'LaunchForma LLC',
    signingOfficerName: 'Maria Acosta',
    signingOfficerTitle: 'Authorized Signer',
    email: 'agent@launchforma.com',
    phone: '+1 (305) 555-0100',
    street1: '14160 Palmetto Frontage Road',
    street2: 'Suite 101',
    city: 'Miami Lakes',
    state: 'FL',
    zip: '33016',
    yearOneIncluded: true,
    renewalCents: 11_900, // $119
  },
  quirks: {
    onlineFilingOnly: false,
  },
  marketingTiming: {
    badgeKey: 'badge_filedSameDay',
    badgeFallback: 'Filed same business day',
  },
  processingOptions: [
    {
      id: 'standard',
      label: 'Standard processing',
      description:
        'Florida processes electronic filings same business day in most cases. No additional state fee.',
      estimate: '1–2 business days',
      feeCents: 0,
      isDefault: true,
    },
  ],
};

// ─── Wyoming ──────────────────────────────────────────────────────────────

const WYOMING_RULE: FormationStateRule = {
  code: 'WY',
  slug: 'wyoming',
  name: 'Wyoming',
  nameEs: 'Wyoming',
  shortName: 'WY',
  hasLiveNameSearch: false,
  documentLabels: {
    llcArticles: 'Articles of Organization',
    corpArticles: 'Articles of Incorporation',
    coverLetter: 'Cover Letter',
  },
  statuteReferences: {
    llc: 'Wyoming Limited Liability Company Act, W.S. 17-29',
    corp: 'Wyoming Business Corporation Act, W.S. 17-16',
  },
  fees: {
    // Per Wyoming Secretary of State: $100 base filing fee for LLCs and
    // for-profit corporations. Wyoming does not sell certificates of status
    // as a separate filing add-on at submission; we charge the issuance fee
    // at request time and forward to the state ($25 for the certificate).
    llcTotal: 10_000,
    corpTotal: 10_000,
    certificateOfStatusLLC: 2_500,
    certificateOfStatusCorp: 2_500,
    certifiedCopyLLC: 3_000,
    certifiedCopyCorp: 3_000,
  },
  addressRules: {
    principalAddressRequired: true,
    principalAddressMustBeInState: false,
    mailingAddressRequired: true,
    registeredAgentAddressMustBeInState: true,
    registeredAgentRequiresPhysicalStreet: true,
    inStateRequirementNote:
      'Wyoming requires a registered office and registered agent with a physical Wyoming street address where someone is present during business hours.',
  },
  nameRules: {
    llcSuffixes: [
      { value: 'LLC', label: 'LLC' },
      { value: 'L.L.C.', label: 'L.L.C.' },
      { value: 'Limited Liability Company', label: 'Limited Liability Company' },
      { value: 'Limited Company', label: 'Limited Company' },
      { value: 'L.C.', label: 'L.C.' },
      { value: 'LC', label: 'LC' },
      { value: 'Ltd. Liability Co.', label: 'Ltd. Liability Co.' },
    ],
    corpSuffixes: [
      { value: 'Corp', label: 'Corp' },
      { value: 'Corporation', label: 'Corporation' },
      { value: 'Inc', label: 'Inc' },
      { value: 'Incorporated', label: 'Incorporated' },
      { value: 'Co', label: 'Co' },
      { value: 'Company', label: 'Company' },
      { value: 'Limited', label: 'Limited' },
      { value: 'Ltd', label: 'Ltd' },
    ],
    prohibitedWords: [
      'bank',
      'banking',
      'trust',
      'insurance',
      'olympic',
      'olympiad',
      'cooperative',
    ],
    nonDistinguishingTokens: [
      'the',
      'and',
      'a',
      'an',
      'of',
      'for',
      'in',
      'on',
      'at',
      'to',
      'by',
      'company',
      'co',
      'corp',
      'corporation',
      'inc',
      'incorporated',
      'llc',
      'l.l.c.',
      'lc',
      'l.c.',
      'limited',
      'ltd',
      'limited company',
      'limited liability company',
      'limited liability co',
      'ltd liability co',
      'limited partnership',
      'lp',
      'partnership',
      'statutory trust',
      'statutory foundation',
      'l3c',
      'dao',
      'lao',
    ],
    manualReviewPatterns: [
      {
        id: 'wy-leading-a',
        reason:
          'Wyoming requires names beginning with "A" (or A. / A & / A J style) to be paper-filed for manual review by the Secretary of State.',
        // Matches "A " plus letter or punctuation following the leading "A".
        // Examples: "A Red Wagon LLC", "A.J. Construction LLC", "A & J", "A J Construction".
        test: (n) => /^a(?=\s|[.&,'-])/i.test(n.trim()),
      },
      {
        id: 'wy-special-characters',
        reason:
          'Wyoming requires names containing special characters (other than basic punctuation in suffixes like "L.L.C.") to be paper-filed for manual review.',
        // Allow only letters, digits, spaces, apostrophes, hyphens, ampersands, commas and dots.
        test: (n) => /[^a-zA-Z0-9\s.,'&-]/.test(n.trim()),
      },
    ],
    restrictedWordGroups: [
      {
        id: 'wy-banking',
        label: 'Banking, trust & financial',
        words: [
          'bank',
          'banks',
          'banker',
          'bankers',
          'banc',
          'bancs',
          'bancorp',
          'bancorporation',
          'banque',
          'banqe',
          'banq',
          'banquer',
          'banco',
          'banca',
          'ptc',
          'private trust company',
          'trust',
          'trusts',
        ],
        action: 'manual_review',
        reason:
          'Wyoming requires Division of Banking approval before filing names containing banking, trust, or PTC terms. We will route the filing through manual review.',
      },
      {
        id: 'wy-education',
        label: 'Education',
        words: [
          'academy',
          'academies',
          'college',
          'colleges',
          'edu',
          'educate',
          'educates',
          'education',
          'educational',
          'institute',
          'institutes',
          'institution',
          'institutions',
          'school',
          'schools',
          'university',
          'universities',
        ],
        action: 'manual_review',
        reason:
          'Wyoming requires Department of Education approval before filing names containing education-related terms. We will route the filing through manual review.',
      },
      {
        id: 'wy-insurance',
        label: 'Insurance',
        words: ['insurance', 'insurer', 'underwriters', 'reinsurance'],
        action: 'block',
        reason:
          'Insurance-related names require Wyoming Department of Insurance pre-approval and cannot be self-served through our wizard.',
      },
      {
        id: 'wy-olympic',
        label: 'Olympic / restricted',
        words: ['olympic', 'olympiad', 'cooperative', 'co-op'],
        action: 'block',
        reason:
          'These terms are protected under Wyoming statute and cannot be used without specific authorization.',
      },
    ],
  },
  annualCompliance: [
    {
      entityType: 'LLC',
      kind: 'annual_report',
      label: 'Annual Report (License Tax)',
      baseFeeCents: 6_000, // $60 minimum
      lateFeeCents: 0,
      hasVariableFee: true,
      description:
        'Wyoming LLCs file an Annual Report and pay a License Tax of $60 minimum, or $0.0002 per dollar of in-state assets if higher. The report is due on the first day of the LLC\'s anniversary month each year.',
      deadline: { kind: 'anniversary_month_first_day' },
    },
    {
      entityType: 'CORP',
      kind: 'annual_report',
      label: 'Annual Report (License Tax)',
      baseFeeCents: 6_000,
      lateFeeCents: 0,
      hasVariableFee: true,
      description:
        'Wyoming corporations file an Annual Report and pay a License Tax of $60 minimum, or $0.0002 per dollar of in-state assets if higher. Due the first day of the anniversary month each year.',
      deadline: { kind: 'anniversary_month_first_day' },
    },
  ],
  effectiveDate: {
    minDaysBack: 0,
    minDaysBackUsesBusinessDays: false,
    maxDaysForward: 90,
  },
  urls: {
    search:
      'https://wyobiz.wyo.gov/Business/FilingSearch.aspx',
    filing:
      'https://wyobiz.wyo.gov/business/RegistrationInstr.aspx',
    annualReport: 'https://wyobiz.wyo.gov/business/AnnualReport.aspx',
    homepage: 'https://sos.wyo.gov/Business/',
  },
  filingMailingAddress: {
    label: 'Wyoming Secretary of State, Business Division',
    lines: [
      'Wyoming Secretary of State',
      'Business Division',
      'Herschler Building East, Suite 101',
      '122 W 25th Street',
      'Cheyenne, WY 82002-0020',
    ],
  },
  registeredAgent: {
    name: 'LaunchForma WY Agents LLC',
    signingOfficerName: 'Daniel Roberts',
    signingOfficerTitle: 'Authorized Signer',
    email: 'agent-wy@launchforma.com',
    phone: '+1 (307) 555-0150',
    street1: '30 N Gould St',
    street2: 'Suite R',
    city: 'Sheridan',
    state: 'WY',
    zip: '82801',
    yearOneIncluded: true,
    renewalCents: 11_900,
  },
  quirks: {
    requiresElectronicServiceConsent: true,
    requiresOrganizerEmail: true,
    onlineFilingOnly: false,
    customerNote:
      'Wyoming standard online filings typically take ~3 weeks. Choose expedited processing in the next step if you need it filed faster. Annual reports are due on the first of your anniversary month every year.',
  },
  marketingTiming: {
    badgeKey: 'badge_filedThreeWeeks',
    badgeFallback: 'Standard filing in ~3 weeks · expedited available',
  },
  processingOptions: [
    {
      id: 'standard',
      label: 'Standard processing',
      description: 'Wyoming Secretary of State standard online queue. No additional fee.',
      estimate: '~3 weeks',
      feeCents: 0,
      isDefault: true,
    },
    {
      id: 'expedited',
      label: 'Expedited processing',
      description:
        'Wyoming offers expedited processing for an additional fee paid to the Secretary of State. Final amount is confirmed at submission.',
      estimate: '~1 week',
      feeCents: 5_000, // Provisional — confirmed by ops at submission.
      feeIsProvisional: true,
    },
  ],
};

// ─── Delaware ─────────────────────────────────────────────────────────────

const DELAWARE_RULE: FormationStateRule = {
  code: 'DE',
  slug: 'delaware',
  name: 'Delaware',
  nameEs: 'Delaware',
  shortName: 'DE',
  hasLiveNameSearch: false,
  documentLabels: {
    llcArticles: 'Certificate of Formation',
    corpArticles: 'Certificate of Incorporation',
    coverLetter: 'Cover Memo',
  },
  statuteReferences: {
    llc: 'Delaware Limited Liability Company Act, 6 Del. C. § 18-201',
    corp: 'Delaware General Corporation Law, 8 Del. C. § 102',
  },
  fees: {
    // Delaware: LLC Certificate of Formation = $110 (total including filing
    // fee + minimum required document collection fee). Per the Division of
    // Corporations Fee Schedule. Corporations: minimum $109 for up to
    // 1,500 shares with no par value (we cap at this configuration for
    // launch-safe filings; anything beyond triggers admin review).
    llcTotal: 11_000, // $110
    corpTotal: 10_900, // $109 minimum
    certificateOfStatusLLC: 5_000, // $50 short-form Certificate of Good Standing
    certificateOfStatusCorp: 5_000,
    certifiedCopyLLC: 5_000, // $50 certified copy
    certifiedCopyCorp: 5_000,
  },
  addressRules: {
    // Delaware's Certificate of Formation only requires the registered office
    // address. We still collect a principal/business address for internal
    // bookkeeping, EIN paperwork, and the customer dashboard, but it is not
    // required to live in Delaware (and is not even mandatory at filing).
    principalAddressRequired: false,
    principalAddressMustBeInState: false,
    mailingAddressRequired: false,
    registeredAgentAddressMustBeInState: true,
    registeredAgentRequiresPhysicalStreet: true,
    inStateRequirementNote:
      'Delaware requires a registered office and registered agent with a physical Delaware street address; the agent must be available during normal business hours.',
  },
  nameRules: {
    llcSuffixes: [
      { value: 'LLC', label: 'LLC' },
      { value: 'L.L.C.', label: 'L.L.C.' },
      { value: 'Limited Liability Company', label: 'Limited Liability Company' },
    ],
    corpSuffixes: [
      { value: 'Corp', label: 'Corp' },
      { value: 'Corporation', label: 'Corporation' },
      { value: 'Inc', label: 'Inc' },
      { value: 'Incorporated', label: 'Incorporated' },
      { value: 'Company', label: 'Company' },
      { value: 'Limited', label: 'Limited' },
    ],
    prohibitedWords: [
      'bank',
      'trust',
      'insurance',
      'university',
      'college',
    ],
    restrictedWordGroups: [
      {
        id: 'de-banking',
        label: 'Banking & trust',
        words: ['bank', 'banks', 'banker', 'bankers', 'trust', 'trusts', 'savings'],
        action: 'manual_review',
        reason:
          'Delaware reviews names containing banking/trust terms more carefully. We will route the filing through manual review to avoid rejection.',
      },
      {
        id: 'de-insurance',
        label: 'Insurance',
        words: ['insurance', 'insurer', 'underwriters', 'reinsurance'],
        action: 'block',
        reason:
          'Insurance-related entity names require Delaware Department of Insurance pre-approval and cannot be self-served through our wizard.',
      },
      {
        id: 'de-education',
        label: 'Education',
        words: ['university', 'college', 'academy'],
        action: 'manual_review',
        reason:
          'Delaware reviews higher-education names cautiously. We will route the filing through manual review before submission.',
      },
    ],
    subjectiveReviewNote:
      'Delaware Division of Corporations may refuse a name on subjective grounds (deception, public-safety implications, abusive patterns, or extreme length) under 20 Del. Admin. Code § 102. We cannot fully pre-clear a Delaware name — final approval rests with the Division.',
  },
  annualCompliance: [
    {
      entityType: 'LLC',
      kind: 'annual_tax',
      label: 'Annual Tax (no report)',
      baseFeeCents: 30_000, // $300 flat
      lateFeeCents: 20_000, // $200 + 1.5%/mo penalty
      description:
        'Delaware LLCs do not file an annual report — they pay a flat $300 Annual Tax due June 1 each year. Missing the deadline incurs a $200 penalty plus 1.5% monthly interest.',
      deadline: { kind: 'fixed_date', month: 6, day: 1 },
    },
    {
      entityType: 'CORP',
      kind: 'franchise_tax',
      label: 'Annual Report & Franchise Tax',
      baseFeeCents: 22_500, // $225 minimum (Authorized Shares method, ≤5,000 shares)
      lateFeeCents: 20_000,
      hasVariableFee: true,
      description:
        'Delaware corporations file an Annual Report and pay Franchise Tax due March 1 each year. Minimum tax + report fee is $225 (small companies), but the tax can rise sharply based on authorized shares or assumed par-value capital. We will alert you to the optimal calculation method.',
      deadline: { kind: 'fixed_date', month: 3, day: 1 },
    },
  ],
  effectiveDate: {
    minDaysBack: 0,
    minDaysBackUsesBusinessDays: false,
    maxDaysForward: 90,
  },
  urls: {
    search: 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx',
    filing: 'https://corp.delaware.gov/howtoform/',
    annualReport: 'https://corp.delaware.gov/paytaxes/',
    homepage: 'https://corp.delaware.gov/',
  },
  filingMailingAddress: {
    label: 'Delaware Division of Corporations',
    lines: [
      'Delaware Division of Corporations',
      '401 Federal Street, Suite 4',
      'Dover, DE 19901',
    ],
  },
  registeredAgent: {
    name: 'LaunchForma DE Agents LLC',
    signingOfficerName: 'Sarah Whitfield',
    signingOfficerTitle: 'Authorized Signer',
    email: 'agent-de@launchforma.com',
    phone: '+1 (302) 555-0175',
    street1: '1209 Orange Street',
    city: 'Wilmington',
    state: 'DE',
    zip: '19801',
    yearOneIncluded: true,
    renewalCents: 14_900, // $149/yr (DE RA market is more expensive)
  },
  quirks: {
    requiresParValueForCorp: true,
    corpFeeDependsOnStockStructure: true,
    onlineFilingOnly: false,
    customerNote:
      'Delaware standard processing currently runs about 6 weeks. Choose 8-business-day expedited processing in the next step ($50 state fee) if you need it faster. Standard corporation filings assume up to 1,500 authorized shares with no par value — a higher share count can increase Delaware\'s franchise tax in future years.',
  },
  marketingTiming: {
    badgeKey: 'badge_filedDelawareStandard',
    badgeFallback: 'Standard filing in ~6 weeks · 8-day expedited available',
  },
  processingOptions: [
    {
      id: 'standard',
      label: 'Standard processing',
      description:
        'Delaware Division of Corporations standard queue. No additional state fee.',
      estimate: '~6 weeks',
      feeCents: 0,
      isDefault: true,
    },
    {
      id: 'expedited_8bd',
      label: '8-business-day expedited',
      description:
        'Delaware 8-business-day expedited processing. State fee is paid directly to Delaware.',
      estimate: '8 business days',
      feeCents: 5_000, // $50 expedited fee
    },
  ],
};

// ─── Public API ───────────────────────────────────────────────────────────

export const FORMATION_STATES: Readonly<Record<StateCode, FormationStateRule>> = {
  FL: FLORIDA_RULE,
  WY: WYOMING_RULE,
  DE: DELAWARE_RULE,
};

const BY_SLUG: Readonly<Record<string, FormationStateRule>> = {
  florida: FLORIDA_RULE,
  wyoming: WYOMING_RULE,
  delaware: DELAWARE_RULE,
};

/**
 * Resolve a {@link FormationStateRule} from a USPS code (case-insensitive)
 * or a URL slug. Returns Florida when the input is empty or unknown so
 * callers never crash on garbage state values.
 */
export function getFormationState(
  input: string | null | undefined,
): FormationStateRule {
  if (!input) return FLORIDA_RULE;
  const trimmed = input.trim();
  if (!trimmed) return FLORIDA_RULE;
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && (FORMATION_STATES as Record<string, FormationStateRule>)[upper]) {
    return FORMATION_STATES[upper as StateCode];
  }
  const lower = trimmed.toLowerCase();
  if (BY_SLUG[lower]) return BY_SLUG[lower];
  return FLORIDA_RULE;
}

/** True when the given input resolves to a state that supports paid checkout. */
export function isActiveFormationState(input: string | null | undefined): boolean {
  if (!input) return false;
  const trimmed = input.trim().toUpperCase();
  return ACTIVE_FORMATION_STATES.includes(trimmed as StateCode);
}

/**
 * Look up the annual-compliance rule for a (state, entity type) pair.
 * Falls back to the first rule on the state if the entity type isn't
 * explicitly listed (defensive — every active state lists both LLC and CORP).
 */
export function annualComplianceFor(
  state: FormationStateRule,
  entityType: EntityType,
): AnnualComplianceRule {
  return (
    state.annualCompliance.find((r) => r.entityType === entityType) ??
    state.annualCompliance[0]
  );
}

/** Return the formation document label for a (state, entity type) pair. */
export function formationDocumentLabel(
  state: FormationStateRule,
  entityType: EntityType,
): string {
  return entityType === 'LLC'
    ? state.documentLabels.llcArticles
    : state.documentLabels.corpArticles;
}

/** Customer-facing dollar fee for the formation filing in a given state. */
export function stateFilingFeeCents(
  state: StateCode | FormationStateRule,
  entityType: EntityType,
): number {
  const rule = typeof state === 'string' ? FORMATION_STATES[state] : state;
  return entityType === 'LLC' ? rule.fees.llcTotal : rule.fees.corpTotal;
}

/** Cost of an optional Certificate of Status add-on, by state. */
export function certificateOfStatusFeeCents(
  state: StateCode | FormationStateRule,
  entityType: EntityType,
): number {
  const rule = typeof state === 'string' ? FORMATION_STATES[state] : state;
  return entityType === 'LLC'
    ? rule.fees.certificateOfStatusLLC
    : rule.fees.certificateOfStatusCorp;
}

/** Cost of an optional Certified Copy add-on, by state. */
export function certifiedCopyFeeCents(
  state: StateCode | FormationStateRule,
  entityType: EntityType,
): number {
  const rule = typeof state === 'string' ? FORMATION_STATES[state] : state;
  return entityType === 'LLC' ? rule.fees.certifiedCopyLLC : rule.fees.certifiedCopyCorp;
}

/** Resolve the default processing option for a state. */
export function defaultProcessingOption(
  state: StateCode | FormationStateRule,
): ProcessingOption {
  const rule = typeof state === 'string' ? FORMATION_STATES[state] : state;
  return (
    rule.processingOptions.find((o) => o.isDefault) ?? rule.processingOptions[0]
  );
}

/** Look up a processing option by id; falls back to the default. */
export function resolveProcessingOption(
  state: StateCode | FormationStateRule,
  id: string | null | undefined,
): ProcessingOption {
  const rule = typeof state === 'string' ? FORMATION_STATES[state] : state;
  const match = id ? rule.processingOptions.find((o) => o.id === id) : null;
  return match ?? defaultProcessingOption(rule);
}

/** Cents added to government remittance for a chosen processing option. */
export function processingFeeCents(
  state: StateCode | FormationStateRule,
  id: string | null | undefined,
): number {
  return resolveProcessingOption(state, id).feeCents;
}
