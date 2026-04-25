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

export function isValidEffectiveDate(date: Date): { valid: boolean; error?: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const min = new Date(today);
  min.setDate(min.getDate() - FL.effectiveDate.minDaysBack);
  const max = new Date(today);
  max.setDate(max.getDate() + FL.effectiveDate.maxDaysForward);
  if (date < min)
    return {
      valid: false,
      error: `Effective date can be at most ${FL.effectiveDate.minDaysBack} days in the past.`,
    };
  if (date > max)
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
