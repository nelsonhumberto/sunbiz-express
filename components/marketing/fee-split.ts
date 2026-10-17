import {
  addOnPriceParts,
  tierPriceParts,
  type CostBreakdownLine,
  type EntityType,
} from '@/lib/pricing';
import type { StateCode } from '@/lib/formation-states';
import { formatCurrency } from '@/lib/utils';

type FeeSplitTranslator = (
  key: string,
  values: Record<string, string>,
) => string;

/** "Service fee $X + Florida state fee $Y" */
export function feeSplitLabel(
  t: FeeSplitTranslator,
  parts: { serviceCents: number; stateFeeCents: number },
  stateName: string,
): string {
  return t('feeSplit', {
    service: formatCurrency(parts.serviceCents),
    state: stateName,
    stateFee: formatCurrency(parts.stateFeeCents),
  });
}

/**
 * Checkout subtitle for a package line, or for an add-on that includes a
 * state fee. Returns null for service-only lines so the caller can keep
 * the existing cadence note.
 */
export function lineFeeSplit(
  line: CostBreakdownLine,
  entityType: EntityType,
  state: StateCode,
  stateName: string,
  t: FeeSplitTranslator,
): string | null {
  if (line.category === 'package' && line.tierSlug) {
    return feeSplitLabel(t, tierPriceParts(line.tierSlug, entityType, state), stateName);
  }
  if (line.category === 'addon' && line.addOnSlug) {
    const parts = addOnPriceParts(line.addOnSlug, entityType, state);
    if (parts.stateFeeCents > 0) return feeSplitLabel(t, parts, stateName);
  }
  return null;
}
