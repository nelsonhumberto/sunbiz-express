// Florida-specific business formation rules and constants
// Sources: incorporation_app_developer_guide.md, florida_requirements.md

export const FL = {
  stateCode: 'FL',
  stateName: 'Florida',

  // Filing fees in cents
  fees: {
    llcArticles: 10_000,             // $100.00
    llcRegisteredAgent: 2_500,       // $25.00
    llcTotal: 12_500,                // $125.00
    corpArticles: 3_500,             // $35.00
    corpRegisteredAgent: 3_500,      // $35.00
    corpTotal: 7_000,                // $70.00
    certificateOfStatusLLC: 500,     // $5.00
    certificateOfStatusCorp: 875,    // $8.75
    certifiedCopyLLC: 3_000,         // $30.00
    certifiedCopyCorp: 875,          // $8.75
    annualReportLLC: 13_875,         // $138.75
    annualReportCorp: 15_000,        // $150.00
    annualReportLateFee: 40_000,     // $400.00 non-waivable
    raChangeFeeLLC: 2_500,           // $25
    raChangeFeeCorp: 3_500,          // $35
    reinstatementLLC: 10_000,        // $100
    reinstatementCorp: 60_000,       // $600
  },

  // Annual report window
  annualReport: {
    openMonth: 1,    // Jan 1
    openDay: 1,
    closeMonth: 5,   // May 1 (11:59 PM ET)
    closeDay: 1,
    administrativeDissolutionMonth: 9, // Third Friday in September
  },

  // Effective date range
  effectiveDate: {
    minDaysBack: 5,   // up to 5 days retroactive
    maxDaysForward: 90, // up to 90 days future
  },

  // URLs (per sunbiz_technical_analysis.md)
  urls: {
    search: 'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName',
    llcWizard: 'https://efile.sunbiz.org/llc_file.html',
    documentProcessingDates: 'https://dos.fl.gov/sunbiz/document-processing-dates/',
  },
} as const;

// ─── Name validation ──────────────────────────────────────────────────────

const LLC_SUFFIXES = [
  'LLC',
  'L.L.C.',
  'L.L.C',
  'LIMITED LIABILITY COMPANY',
];

const CORP_SUFFIXES = [
  'CORP',
  'CORP.',
  'CORPORATION',
  'INC',
  'INC.',
  'INCORPORATED',
  'CO',
  'CO.',
  'COMPANY',
];

const PROHIBITED_WORDS = [
  'bank',
  'banking',
  'banker',
  'trust',
  'savings',
  'credit union',
  'insurance',
  'university',
  'college',
];

// Suffix tokens used by the distinguishability normalizer. Includes LLC/Corp
// suffixes, partnerships, and professional-association forms. Each entry is
// a sequence of WHITESPACE-SEPARATED tokens that appear as a suffix.
const DISTINGUISH_SUFFIX_TOKENS: readonly string[][] = [
  ['LIMITED', 'LIABILITY', 'COMPANY'],
  ['LIMITED', 'LIABILITY', 'PARTNERSHIP'],
  ['LIMITED', 'PARTNERSHIP'],
  ['PROFESSIONAL', 'ASSOCIATION'],
  ['L', 'L', 'C'],
  ['L', 'L', 'P'],
  ['L', 'P'],
  ['P', 'A'],
  ['LLC'],
  ['LLP'],
  ['LP'],
  ['LTD'],
  ['CORPORATION'],
  ['CORP'],
  ['INCORPORATED'],
  ['INC'],
  ['COMPANY'],
  ['CO'],
  ['CHARTERED'],
  ['PA'],
];

// Articles (definite/indefinite) — not distinguishing per the FL FAQ.
const NON_DISTINGUISHING_ARTICLES = new Set(['THE', 'A', 'AN']);

// "and" / "&" treated as non-distinguishing — we drop the connector entirely.
const NON_DISTINGUISHING_CONNECTORS = new Set(['AND']);

export function normalizeBusinessName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripSuffix(name: string): string {
  let normalized = normalizeBusinessName(name);
  for (const suffix of [...LLC_SUFFIXES, ...CORP_SUFFIXES]) {
    const sfx = suffix.replace(/\./g, '');
    const re = new RegExp(`\\s+${sfx}$`);
    if (re.test(normalized)) {
      normalized = normalized.replace(re, '');
      break;
    }
  }
  return normalized.trim();
}

export function hasLLCSuffix(name: string): boolean {
  const upper = normalizeBusinessName(name);
  return LLC_SUFFIXES.some((sfx) => {
    const cleaned = sfx.replace(/\./g, '');
    return new RegExp(`\\s+${cleaned}$`).test(upper);
  });
}

export function hasCorpSuffix(name: string): boolean {
  const upper = normalizeBusinessName(name);
  return CORP_SUFFIXES.some((sfx) => {
    const cleaned = sfx.replace(/\./g, '');
    return new RegExp(`\\s+${cleaned}$`).test(upper);
  });
}

// ─── Suffix picker support ────────────────────────────────────────────────
//
// The wizard exposes the entity suffix as a dedicated dropdown so customers
// pick the legal ending explicitly instead of guessing it. The display value
// is what we render and persist (e.g. "LLC", "Limited Liability Company");
// the matcher is the loose pattern used to detect the suffix when parsing
// an existing draft's saved name.

export const LLC_SUFFIX_OPTIONS = [
  { value: 'LLC', label: 'LLC' },
  { value: 'L.L.C.', label: 'L.L.C.' },
  { value: 'Limited Liability Company', label: 'Limited Liability Company' },
] as const;

export const CORP_SUFFIX_OPTIONS = [
  { value: 'Corp', label: 'Corp' },
  { value: 'Corporation', label: 'Corporation' },
  { value: 'Inc', label: 'Inc' },
  { value: 'Incorporated', label: 'Incorporated' },
  { value: 'Co', label: 'Co' },
  { value: 'Company', label: 'Company' },
] as const;

export type EntitySuffixOption =
  | (typeof LLC_SUFFIX_OPTIONS)[number]
  | (typeof CORP_SUFFIX_OPTIONS)[number];

/**
 * Split a saved entity name into a base name and a recognized suffix.
 *
 * Used when re-opening a draft so we can pre-populate both the base-name
 * input and the suffix dropdown. Picks the longest matching suffix so
 * "Acme Limited Liability Company" doesn't degrade to "Acme Limited
 * Liability" + "Company".
 *
 * Returns `matched: false` when no suffix is recognized; the caller should
 * fall back to a default (typically the first option for the entity type).
 */
export function splitEntityName(
  name: string,
  entityType: 'LLC' | 'CORP',
): { base: string; suffix: string; matched: boolean } {
  const options =
    entityType === 'LLC' ? LLC_SUFFIX_OPTIONS : CORP_SUFFIX_OPTIONS;
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return { base: '', suffix: options[0].value, matched: false };
  }

  const sortedByLength = [...options].sort(
    (a, b) => b.value.length - a.value.length,
  );

  for (const opt of sortedByLength) {
    const escaped = opt.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow comma OR whitespace before the suffix and an optional trailing period.
    const pattern = `(?:,\\s*|\\s+)${escaped}\\.?\\s*$`;
    const re = new RegExp(pattern, 'i');
    if (re.test(trimmed)) {
      const base = trimmed.replace(re, '').trim();
      return { base, suffix: opt.value, matched: true };
    }
  }

  return { base: trimmed, suffix: options[0].value, matched: false };
}

/** Combine a base name and suffix into the canonical entity name. */
export function joinEntityName(base: string, suffix: string): string {
  const cleanBase = (base ?? '').trim();
  const cleanSuffix = (suffix ?? '').trim();
  if (!cleanBase) return cleanSuffix;
  if (!cleanSuffix) return cleanBase;
  return `${cleanBase} ${cleanSuffix}`;
}

/**
 * Reduce a token to its singular/non-possessive base for the distinguishability
 * comparison. Handles the FL FAQ examples:
 *   Sport ≡ Sports ≡ Sport's
 *   Cracker ≡ Crackers
 *   Cookies ≡ Cookies' ≡ Cookies! (after punctuation strip)
 * Conservative: tokens of length ≤ 3 are not stemmed, and `-SS` endings are
 * preserved (BUSINESS, GLASS, BLISS).
 */
function stemDistinguishToken(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith('IES') && t.length >= 5) return t.slice(0, -3) + 'Y';
  if (t.endsWith('SES') && t.length >= 5) return t.slice(0, -2); // BUSINESSES → BUSINESS
  if (t.endsWith('SS')) return t;
  if (t.endsWith('S')) return t.slice(0, -1);
  return t;
}

/**
 * Florida "distinguishable upon the record" normalizer.
 *
 * Per https://dos.fl.gov/sunbiz/about-us/faqs/#faq-answer1, these factors are
 * NOT considered distinguishing and are stripped out:
 *   - Entity suffixes (Corp, Inc, Co, LLC, L.L.C., LP, LLP, P.A., Chartered…)
 *   - Articles: "the", "a", "an"
 *   - Connectors: "and", "&"
 *   - Punctuation and symbols
 *   - Singular/plural/possessive forms
 *
 * Returns a canonical token string. Two names are "the same on the record"
 * iff their normalized forms are equal.
 */
export function normalizeDistinguishableName(name: string): string {
  if (!name) return '';
  let n = name.toUpperCase();

  // Strip apostrophes (possessives) before splitting on punctuation so that
  // "Tallahassee's" → "TALLAHASSEES" rather than two tokens.
  n = n.replace(/[\u2018\u2019']/g, '');

  // Replace "&" with " AND " so it tokenizes consistently and is dropped later.
  n = n.replace(/&/g, ' AND ');

  // Replace any non-alphanumeric character with whitespace, then collapse runs.
  n = n.replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return '';

  let tokens = n.split(' ');

  // Strip suffix groups from the END, repeatedly (handles e.g. "PROPERTIES, INC, LLC"
  // weirdness or "CO, INC" historical filings).
  let stripped = true;
  while (stripped && tokens.length > 1) {
    stripped = false;
    for (const sfx of DISTINGUISH_SUFFIX_TOKENS) {
      if (tokens.length <= sfx.length) continue;
      const tail = tokens.slice(-sfx.length);
      if (tail.length === sfx.length && tail.every((t, i) => t === sfx[i])) {
        tokens = tokens.slice(0, -sfx.length);
        stripped = true;
        break;
      }
    }
  }

  // Drop articles and connectors (anywhere — leading "THE", trailing "AND" left
  // over from "Cheese AND" after dropping the right-hand suffix, etc.).
  tokens = tokens.filter(
    (t) => !NON_DISTINGUISHING_ARTICLES.has(t) && !NON_DISTINGUISHING_CONNECTORS.has(t),
  );

  // Stem each token for plural/possessive collapse.
  tokens = tokens.map(stemDistinguishToken);

  return tokens.join(' ');
}

/**
 * True iff `a` and `b` are the same name "upon the record" per Florida rules.
 */
export function namesAreNotDistinguishable(a: string, b: string): boolean {
  const na = normalizeDistinguishableName(a);
  const nb = normalizeDistinguishableName(b);
  if (!na || !nb) return false;
  return na === nb;
}

export function validateBusinessName(
  name: string,
  entityType: 'LLC' | 'CORP'
): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: 'Business name is required.' };
  if (trimmed.length < 2) return { valid: false, error: 'Name is too short (minimum 2 characters).' };
  if (trimmed.length > 100) return { valid: false, error: 'Name is too long (maximum 100 characters).' };

  const lower = trimmed.toLowerCase();
  for (const word of PROHIBITED_WORDS) {
    if (lower.includes(word)) {
      return {
        valid: false,
        error: `Names containing "${word}" require special regulatory approval in Florida.`,
      };
    }
  }

  if (entityType === 'LLC' && !hasLLCSuffix(trimmed)) {
    return {
      valid: false,
      error: 'Florida LLCs must end with "LLC", "L.L.C.", or "Limited Liability Company".',
    };
  }
  if (entityType === 'CORP' && !hasCorpSuffix(trimmed)) {
    return {
      valid: false,
      error:
        'Florida Corporations must end with "Corp", "Corporation", "Inc", "Incorporated", "Co", or "Company".',
    };
  }

  // Bare suffix-only check after distinguishability normalization (e.g.
  // "Inc" or "The LLC" would normalize to empty).
  if (!normalizeDistinguishableName(trimmed)) {
    return {
      valid: false,
      error: 'Name must contain at least one distinguishing word (suffixes and articles do not count).',
    };
  }
  return { valid: true };
}

// ─── Address validation ───────────────────────────────────────────────────

const PO_BOX_RE = /\bp\.?\s*o\.?\s*(box|drawer)\b|\bpost\s+office\s+box\b/i;
const PMB_RE = /\bp\.?m\.?b\b|\bpmb\s*#?\s*\d+|private\s+mailbox/i;

export function isPoBox(addressLine: string): boolean {
  return PO_BOX_RE.test(addressLine);
}

export function isPrivateMailbox(addressLine: string): boolean {
  return PMB_RE.test(addressLine);
}

export interface AddressInput {
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  inCareOf?: string | null;
}

export function validateRegisteredAgentAddress(addr: AddressInput): {
  valid: boolean;
  error?: string;
} {
  if (!addr.street1?.trim()) return { valid: false, error: 'Street address is required.' };
  if (!addr.city?.trim()) return { valid: false, error: 'City is required.' };
  if (!addr.state?.trim()) return { valid: false, error: 'State is required.' };
  if (!addr.zip?.trim()) return { valid: false, error: 'ZIP is required.' };
  if (addr.state.toUpperCase() !== 'FL')
    return { valid: false, error: 'Registered agent must have a Florida (FL) physical address.' };
  if (isPoBox(addr.street1) || (addr.street2 && isPoBox(addr.street2)))
    return {
      valid: false,
      error: 'P.O. Box addresses are not allowed for registered agents — Florida law requires a physical street address.',
    };
  if (isPrivateMailbox(addr.street1) || (addr.street2 && isPrivateMailbox(addr.street2)))
    return {
      valid: false,
      error: 'Private mailbox addresses (PMB) are not permitted for registered agents.',
    };
  if (!/^\d{5}(-\d{4})?$/.test(addr.zip.trim()))
    return { valid: false, error: 'Enter a valid ZIP code (e.g., 33101 or 33101-1234).' };
  return { valid: true };
}

export function validateGeneralAddress(addr: AddressInput): { valid: boolean; error?: string } {
  if (!addr.street1?.trim()) return { valid: false, error: 'Street address is required.' };
  if (!addr.city?.trim()) return { valid: false, error: 'City is required.' };
  if (!addr.state?.trim()) return { valid: false, error: 'State is required.' };
  if (!addr.zip?.trim()) return { valid: false, error: 'ZIP is required.' };
  if (!/^\d{5}(-\d{4})?$/.test(addr.zip.trim()))
    return { valid: false, error: 'Enter a valid ZIP code.' };
  return { valid: true };
}

// ─── Effective date validation ───────────────────────────────────────────

/**
 * Subtract N business days (Mon-Fri) from a date. Holidays are not honored
 * (no calendar dependency); this is a conservative approximation of Florida's
 * "5 business days prior" cap.
 */
export function subtractBusinessDays(from: Date, businessDays: number): Date {
  const d = new Date(from);
  let remaining = Math.max(0, Math.floor(businessDays));
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) remaining--;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isValidEffectiveDate(date: Date): { valid: boolean; error?: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  // Florida allows an effective date up to 5 business days BEFORE filing and
  // up to 90 calendar days AFTER. We use business days for the backward cap
  // to match the FL Profit Corporation Instructions.
  const min = subtractBusinessDays(today, FL.effectiveDate.minDaysBack);
  const max = new Date(today);
  max.setDate(max.getDate() + FL.effectiveDate.maxDaysForward);

  if (target < min)
    return {
      valid: false,
      error: `Effective date can be at most ${FL.effectiveDate.minDaysBack} business days in the past.`,
    };
  if (target > max)
    return {
      valid: false,
      error: `Effective date can be at most ${FL.effectiveDate.maxDaysForward} days in the future.`,
    };
  return { valid: true };
}

// ─── Annual report deadline ──────────────────────────────────────────────

/**
 * Compute the next Annual Report due date for a Florida entity.
 * Reports are due January 1 - May 1 of each year.
 * Entities formed Oct 1 - Dec 31 are not required to file in their formation year.
 */
export function computeNextAnnualReport(formationDate: Date, now: Date = new Date()): {
  dueDate: Date;
  reportYear: number;
  filingWindow: { open: Date; close: Date };
} {
  const formationYear = formationDate.getFullYear();
  const formationMonth = formationDate.getMonth(); // 0-indexed (Oct = 9)
  let reportYear = now.getFullYear() + (now.getMonth() >= 4 ? 1 : 0); // if past May, next year

  // Entities formed Oct-Dec defer first annual report by one year
  if (formationMonth >= 9 && formationYear === reportYear - 1) {
    reportYear = formationYear + 2;
  } else if (reportYear < formationYear + 1) {
    reportYear = formationYear + 1;
  }

  const open = new Date(reportYear, 0, 1); // Jan 1
  const close = new Date(reportYear, 4, 1, 23, 59, 0); // May 1, 11:59pm
  return { dueDate: close, reportYear, filingWindow: { open, close } };
}
