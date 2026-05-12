// State-aware validation helpers.
//
// These replace the Florida-only checks in `lib/florida.ts` with rules looked
// up dynamically from the `lib/formation-states.ts` registry. Florida code
// continues to work because Florida is just one entry in the registry.
//
// The wizard, server actions, and PDF generator should use these helpers.
// Florida-only utilities (Sunbiz name search, FL distinguishability) still
// live in `lib/florida.ts` and are imported on demand for the FL flow only.

import type { EntityType, FormationStateRule, StateCode } from './formation-states';
import { FORMATION_STATES, getFormationState } from './formation-states';
import { normalizeBusinessName, normalizeDistinguishableName } from './florida';

// ─── Address validation ───────────────────────────────────────────────────

export interface AddressInput {
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  inCareOf?: string | null;
}

const PO_BOX_RE = /\bp\.?\s*o\.?\s*(box|drawer)\b|\bpost\s+office\s+box\b/i;
const PMB_RE = /\bp\.?m\.?b\b|\bpmb\s*#?\s*\d+|private\s+mailbox/i;

export function isPoBox(addressLine: string): boolean {
  return PO_BOX_RE.test(addressLine);
}

export function isPrivateMailbox(addressLine: string): boolean {
  return PMB_RE.test(addressLine);
}

/**
 * Validate an external Registered Agent address against the formation state's
 * physical-address rule. Every active state requires a physical street
 * address inside that state; PO boxes and PMBs are rejected universally.
 */
export function validateRegisteredAgentAddress(
  addr: AddressInput,
  formationStateCode: StateCode | string,
): { valid: boolean; error?: string } {
  const rule = typeof formationStateCode === 'string'
    ? getFormationState(formationStateCode)
    : (formationStateCode as FormationStateRule);

  if (!addr.street1?.trim()) return { valid: false, error: 'Street address is required.' };
  if (!addr.city?.trim()) return { valid: false, error: 'City is required.' };
  if (!addr.state?.trim()) return { valid: false, error: 'State is required.' };
  if (!addr.zip?.trim()) return { valid: false, error: 'ZIP is required.' };

  if (addr.state.toUpperCase() !== rule.code) {
    return {
      valid: false,
      error: `Registered agent must have a ${rule.name} (${rule.code}) physical address.`,
    };
  }
  if (isPoBox(addr.street1) || (addr.street2 && isPoBox(addr.street2))) {
    return {
      valid: false,
      error: `P.O. Box addresses are not allowed for registered agents — ${rule.name} law requires a physical street address.`,
    };
  }
  if (isPrivateMailbox(addr.street1) || (addr.street2 && isPrivateMailbox(addr.street2))) {
    return {
      valid: false,
      error: 'Private mailbox addresses (PMB) are not permitted for registered agents.',
    };
  }
  if (!/^\d{5}(-\d{4})?$/.test(addr.zip.trim())) {
    return { valid: false, error: 'Enter a valid ZIP code (e.g., 33101 or 33101-1234).' };
  }
  return { valid: true };
}

export function validateGeneralAddress(addr: AddressInput): { valid: boolean; error?: string } {
  if (!addr.street1?.trim()) return { valid: false, error: 'Street address is required.' };
  if (!addr.city?.trim()) return { valid: false, error: 'City is required.' };
  if (!addr.state?.trim()) return { valid: false, error: 'State is required.' };
  if (!addr.zip?.trim()) return { valid: false, error: 'ZIP is required.' };
  if (!/^\d{5}(-\d{4})?$/.test(addr.zip.trim())) {
    return { valid: false, error: 'Enter a valid ZIP code.' };
  }
  return { valid: true };
}

// ─── Business name validation ─────────────────────────────────────────────

function hasSuffix(name: string, suffixes: readonly { value: string }[]): boolean {
  const upper = normalizeBusinessName(name);
  return suffixes.some((sfx) => {
    const cleaned = sfx.value.replace(/\./g, '').toUpperCase();
    return new RegExp(`(?:,\\s*|\\s+)${escapeRegExp(cleaned)}\\.?\\s*$`).test(upper);
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rich result returned by {@link assessBusinessName}. The basic
 * {@link validateBusinessName} call collapses this to `{ valid, error? }`
 * for callers that just need a yes/no.
 */
export interface BusinessNameAssessment {
  /**
   * True when the name passes hard validation (length, suffix, distinguishable
   * word, no blocked words). It can still need manual review — see
   * {@link requiresManualReview}.
   */
  valid: boolean;
  /** Hard validation failure message; only set when `valid === false`. */
  error?: string;
  /**
   * State-specific warnings that must be surfaced to the customer but do not
   * block the filing. Examples: Wyoming names beginning with "A" requiring
   * paper filing, Delaware subjective-review note.
   */
  warnings: BusinessNameWarning[];
  /**
   * True when at least one warning indicates the filing needs paper or
   * admin/manual review before submission. Wizards should display a "we'll
   * file this manually" banner instead of the regular online flow.
   */
  requiresManualReview: boolean;
}

export type BusinessNameWarningKind =
  | 'manual_review_pattern'
  | 'restricted_word_block'
  | 'restricted_word_manual_review'
  | 'subjective_review';

export interface BusinessNameWarning {
  kind: BusinessNameWarningKind;
  /** Stable id of the rule that fired (pattern id or word-group id). */
  id: string;
  /** Plain-language reason shown to the customer. */
  message: string;
  /** Word that triggered the warning, when relevant. */
  word?: string;
}

/**
 * Full assessment of a business name. Returns hard validity, plus a list of
 * state-specific warnings (manual-review patterns, restricted-word groups,
 * subjective-review notes) so the wizard can explain exactly what will
 * happen to the filing.
 */
export function assessBusinessName(
  name: string,
  entityType: EntityType,
  formationStateCode: StateCode | string,
): BusinessNameAssessment {
  const rule = typeof formationStateCode === 'string'
    ? getFormationState(formationStateCode)
    : (formationStateCode as FormationStateRule);

  const trimmed = name.trim();
  const warnings: BusinessNameWarning[] = [];

  if (!trimmed) {
    return { valid: false, error: 'Business name is required.', warnings, requiresManualReview: false };
  }
  if (trimmed.length < 2) {
    return {
      valid: false,
      error: 'Name is too short (minimum 2 characters).',
      warnings,
      requiresManualReview: false,
    };
  }
  if (trimmed.length > 100) {
    return {
      valid: false,
      error: 'Name is too long (maximum 100 characters).',
      warnings,
      requiresManualReview: false,
    };
  }

  const lower = trimmed.toLowerCase();

  // Restricted-word groups take precedence over the legacy prohibitedWords
  // list because they carry per-group action semantics (block vs. manual
  // review) and produce richer customer copy.
  const restrictedGroups = rule.nameRules.restrictedWordGroups ?? [];
  let restrictedBlock: BusinessNameWarning | null = null;
  for (const group of restrictedGroups) {
    for (const word of group.words) {
      const wordLower = word.toLowerCase();
      // Match as a whole-word/phrase token, not an arbitrary substring,
      // so "trustee" doesn't trip the "trust" rule and "banking" doesn't
      // accidentally hit "ranking".
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(wordLower)}([^a-z0-9]|$)`, 'i');
      if (!re.test(lower)) continue;
      if (group.action === 'block') {
        restrictedBlock = {
          kind: 'restricted_word_block',
          id: group.id,
          word,
          message: group.reason,
        };
        break;
      }
      warnings.push({
        kind: 'restricted_word_manual_review',
        id: group.id,
        word,
        message: group.reason,
      });
      break;
    }
    if (restrictedBlock) break;
  }

  // If no restricted-word groups are configured, fall back to the legacy
  // prohibitedWords substring check so existing rules keep working.
  if (!restrictedGroups.length) {
    for (const word of rule.nameRules.prohibitedWords) {
      if (lower.includes(word)) {
        return {
          valid: false,
          error: `Names containing "${word}" require special regulatory approval in ${rule.name}.`,
          warnings,
          requiresManualReview: false,
        };
      }
    }
  }

  if (restrictedBlock) {
    return {
      valid: false,
      error: restrictedBlock.message,
      warnings: [restrictedBlock],
      requiresManualReview: false,
    };
  }

  const expectedSuffixes =
    entityType === 'LLC' ? rule.nameRules.llcSuffixes : rule.nameRules.corpSuffixes;
  if (!hasSuffix(trimmed, expectedSuffixes)) {
    const suffixList = expectedSuffixes.map((s) => `"${s.value}"`).join(', ');
    return {
      valid: false,
      error: `${rule.name} ${entityType === 'LLC' ? 'LLCs' : 'Corporations'} must end with one of: ${suffixList}.`,
      warnings,
      requiresManualReview: false,
    };
  }

  if (!normalizeDistinguishableName(trimmed)) {
    return {
      valid: false,
      error: 'Name must contain at least one distinguishing word (suffixes and articles do not count).',
      warnings,
      requiresManualReview: false,
    };
  }

  // State-specific manual-review patterns (Wyoming "A" / special-character
  // rules). These do not invalidate the name — they simply route the filing
  // to paper / admin review.
  for (const pattern of rule.nameRules.manualReviewPatterns ?? []) {
    if (pattern.test(trimmed)) {
      warnings.push({
        kind: 'manual_review_pattern',
        id: pattern.id,
        message: pattern.reason,
      });
    }
  }

  if (rule.nameRules.subjectiveReviewNote) {
    warnings.push({
      kind: 'subjective_review',
      id: 'subjective-review',
      message: rule.nameRules.subjectiveReviewNote,
    });
  }

  const requiresManualReview = warnings.some(
    (w) =>
      w.kind === 'manual_review_pattern' ||
      w.kind === 'restricted_word_manual_review',
  );

  return { valid: true, warnings, requiresManualReview };
}

/**
 * Validate a business name against the registry rules for the given state.
 * Replaces Florida-only `validateBusinessName` and works for FL/WY/DE.
 */
export function validateBusinessName(
  name: string,
  entityType: EntityType,
  formationStateCode: StateCode | string,
): { valid: boolean; error?: string } {
  const r = assessBusinessName(name, entityType, formationStateCode);
  return r.valid ? { valid: true } : { valid: false, error: r.error };
}

// ─── Effective date validation ───────────────────────────────────────────

function subtractBusinessDays(from: Date, businessDays: number): Date {
  const d = new Date(from);
  let remaining = Math.max(0, Math.floor(businessDays));
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isValidEffectiveDate(
  date: Date,
  formationStateCode: StateCode | string,
): { valid: boolean; error?: string } {
  const rule = typeof formationStateCode === 'string'
    ? getFormationState(formationStateCode)
    : (formationStateCode as FormationStateRule);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const min = rule.effectiveDate.minDaysBackUsesBusinessDays
    ? subtractBusinessDays(today, rule.effectiveDate.minDaysBack)
    : (() => {
        const m = new Date(today);
        m.setDate(m.getDate() - rule.effectiveDate.minDaysBack);
        return m;
      })();
  const max = new Date(today);
  max.setDate(max.getDate() + rule.effectiveDate.maxDaysForward);

  if (target < min) {
    if (rule.effectiveDate.minDaysBack <= 0) {
      return { valid: false, error: 'Effective date cannot be in the past.' };
    }
    const unit = rule.effectiveDate.minDaysBackUsesBusinessDays ? 'business days' : 'days';
    return {
      valid: false,
      error: `Effective date can be at most ${rule.effectiveDate.minDaysBack} ${unit} in the past.`,
    };
  }
  if (target > max) {
    return {
      valid: false,
      error: `Effective date can be at most ${rule.effectiveDate.maxDaysForward} days in the future.`,
    };
  }
  return { valid: true };
}

// ─── Annual compliance deadline ──────────────────────────────────────────

export interface AnnualComplianceDeadline {
  dueDate: Date;
  reportYear: number;
  filingWindow: { open: Date; close: Date };
  /** Cost the customer must pay to comply, in cents. */
  baseFeeCents: number;
  lateFeeCents: number;
  label: string;
}

/**
 * Compute the next annual-compliance deadline for an entity given its
 * formation date and state. Handles fixed-date deadlines (FL, DE) and
 * anniversary-month deadlines (WY) generically.
 */
export function computeNextAnnualCompliance(
  formationDate: Date,
  formationStateCode: StateCode | string,
  entityType: EntityType,
  now: Date = new Date(),
): AnnualComplianceDeadline {
  const rule = typeof formationStateCode === 'string'
    ? getFormationState(formationStateCode)
    : (formationStateCode as FormationStateRule);
  const compliance =
    rule.annualCompliance.find((r) => r.entityType === entityType) ??
    rule.annualCompliance[0];

  if (compliance.deadline.kind === 'anniversary_month_first_day') {
    const anniversaryMonth = formationDate.getMonth();
    let year = now.getFullYear();
    const candidate = new Date(year, anniversaryMonth, 1, 23, 59, 0);
    // First report is due the year AFTER formation (most states defer year 0).
    if (
      year < formationDate.getFullYear() + 1 ||
      (year === formationDate.getFullYear() + 1 && now > candidate)
    ) {
      year = Math.max(formationDate.getFullYear() + 1, year + (now > candidate ? 1 : 0));
    }
    const close = new Date(year, anniversaryMonth, 1, 23, 59, 0);
    const open = new Date(year, Math.max(0, anniversaryMonth - 2), 1);
    return {
      dueDate: close,
      reportYear: year,
      filingWindow: { open, close },
      baseFeeCents: compliance.baseFeeCents,
      lateFeeCents: compliance.lateFeeCents,
      label: compliance.label,
    };
  }

  const { month, day } = compliance.deadline; // 1-indexed month
  const formationYear = formationDate.getFullYear();
  let reportYear = now.getFullYear();
  const thisYearDeadline = new Date(reportYear, month - 1, day, 23, 59, 0);
  if (now > thisYearDeadline) reportYear = reportYear + 1;
  // FL deferral rule: entities formed Oct-Dec defer the first annual report.
  if (
    rule.code === 'FL' &&
    formationDate.getMonth() >= 9 &&
    formationYear === reportYear - 1
  ) {
    reportYear = formationYear + 2;
  } else if (reportYear < formationYear + 1) {
    reportYear = formationYear + 1;
  }

  const close = new Date(reportYear, month - 1, day, 23, 59, 0);
  const open = new Date(reportYear, 0, 1);
  return {
    dueDate: close,
    reportYear,
    filingWindow: { open, close },
    baseFeeCents: compliance.baseFeeCents,
    lateFeeCents: compliance.lateFeeCents,
    label: compliance.label,
  };
}

// ─── Suffix helpers (state-aware) ────────────────────────────────────────

/**
 * Return the suffix dropdown options for a given state and entity type. Used
 * by the wizard's name step.
 */
export function suffixOptionsFor(
  formationStateCode: StateCode | string,
  entityType: EntityType,
): readonly { value: string; label: string }[] {
  const rule = typeof formationStateCode === 'string'
    ? getFormationState(formationStateCode)
    : (formationStateCode as FormationStateRule);
  return entityType === 'LLC' ? rule.nameRules.llcSuffixes : rule.nameRules.corpSuffixes;
}

/** Convenience: the legacy FL suffix options exported here for back-compat. */
export const LLC_SUFFIX_OPTIONS = FORMATION_STATES.FL.nameRules.llcSuffixes;
export const CORP_SUFFIX_OPTIONS = FORMATION_STATES.FL.nameRules.corpSuffixes;
