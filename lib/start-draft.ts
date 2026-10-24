import { normalizeNameCheckQuery } from '@/lib/name-check';

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
