// Plan-card feature display. The English labels in lib/pricing.ts stay the
// catalog source. This module only decides which lines a buyer sees.
//
// An Operating Agreement is an LLC document. Corporation buyers must not see
// "Operating Agreement (custom)". Public pages that have no chosen entity
// (the pricing cards, llms.txt) keep the line and mark it as LLC-only.
// LLC buyers keep the original wording.

import type { EntityType } from '@/lib/pricing';

export const OPERATING_AGREEMENT_CUSTOM_LABEL = 'Operating Agreement (custom)';

/** Public, no-entity wording. LLC wizard buyers do not use this string. */
export const OPERATING_AGREEMENT_LLC_SCOPED_LABEL = 'Operating Agreement (LLCs)';

/** pricing.* key for {@link OPERATING_AGREEMENT_LLC_SCOPED_LABEL}. */
export const UNSCOPED_OA_FEATURE_KEY = 'feat_oaLlcs';

export function tierFeaturesForEntity<T extends { label: string }>(
  features: readonly T[],
  entityType: EntityType | null,
): T[] {
  switch (entityType) {
    case 'CORP':
      return features.filter((feature) => feature.label !== OPERATING_AGREEMENT_CUSTOM_LABEL);
    case 'LLC':
    case null:
      return [...features];
    default: {
      const unexpected: never = entityType;
      return unexpected;
    }
  }
}

/** English label for a public list that has not chosen LLC or Corporation. */
export function publicTierFeatureLabel(label: string): string {
  if (label === OPERATING_AGREEMENT_CUSTOM_LABEL) return OPERATING_AGREEMENT_LLC_SCOPED_LABEL;
  return label;
}
