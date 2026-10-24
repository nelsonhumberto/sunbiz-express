import {
  addOnPriceParts,
  tierIncludesCertificateFees,
  tierPriceParts,
  type CostBreakdownLine,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import type { StateCode } from '@/lib/formation-states';
import { formatCurrency } from '@/lib/utils';

type FeeSplitTranslator = (
  key: string,
  values: Record<string, string>,
) => string;

/**
 * "Service fee $X + Florida state fee $Y".
 * Popular and Premium pass a tier so the label says the amount also includes
 * the certified copy and certificate of status. The cents do not change.
 */
export function feeSplitLabel(
  t: FeeSplitTranslator,
  parts: { serviceCents: number; stateFeeCents: number },
  stateName: string,
  tier?: TierSlug,
): string {
  const key =
    tier && tierIncludesCertificateFees(tier) ? 'feeSplitWithCertificates' : 'feeSplit';
  return t(key, {
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
    return feeSplitLabel(
      t,
      tierPriceParts(line.tierSlug, entityType, state),
      stateName,
      line.tierSlug,
    );
  }
  if (line.category === 'addon' && line.addOnSlug) {
    const parts = addOnPriceParts(line.addOnSlug, entityType, state);
    if (parts.stateFeeCents > 0) return feeSplitLabel(t, parts, stateName);
  }
  return null;
}
