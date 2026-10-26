import { nameHasMinimumSubstance, normalizeNameCheckQuery } from '@/lib/name-check';

export type DraftNameDecision =
  | { action: 'resume'; step: number }
  | { action: 'apply'; step: 2 }
  | { action: 'choose' };

/**
 * A returning email already has a draft. A proposed name from /start?name=
 * must not disappear.
 *
 * Same name, or no new name: reopen the draft.
 * Draft has no name yet: write the proposed name and open step 2.
 * Draft already has a different name: ask before replacing it.
 */
export function decideDraftNameResume(input: {
  existingName?: string | null;
  proposedName?: string | null;
  currentStep?: number | null;
}): DraftNameDecision {
  const proposed = normalizeNameCheckQuery(input.proposedName);
  const existing = normalizeNameCheckQuery(input.existingName);
  const step = input.currentStep && input.currentStep >= 1 ? Math.trunc(input.currentStep) : 2;
  if (!proposed || proposed.toLowerCase() === existing.toLowerCase()) {
    return { action: 'resume', step };
  }
  if (!existing) return { action: 'apply', step: 2 };
  return { action: 'choose' };
}

/**
 * /start accepts a name only when it has at least 2 characters and the legal
 * ending is not the whole name. "A LLC" fails. "Northwind" passes.
 */
export function startNameIsAcceptable(raw: string | null | undefined): boolean {
  const name = normalizeNameCheckQuery(raw);
  return name.length >= 2 && nameHasMinimumSubstance(name);
}

/**
 * A guest with no acceptable name does not open wizard step 1.
 * Step 2 is the name screen. Later steps stay where the draft already is.
 */
export function guestWizardStep(input: {
  businessName?: string | null;
  currentStep?: number | null;
}): number {
  const requested =
    input.currentStep && input.currentStep >= 1 ? Math.trunc(input.currentStep) : 2;
  if (requested <= 1 && !startNameIsAcceptable(input.businessName)) return 2;
  return requested;
}
