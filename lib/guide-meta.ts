import { annualComplianceFor, FORMATION_STATES } from '@/lib/formation-states';
import { tierPriceParts } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils';

const META_LIMIT = 160;

/** Dollars for the Spanish Florida LLC cost meta. Same catalog as the price block. */
export function floridaLlcCostMetaValues(): {
  stateFee: string;
  total: string;
  annual: string;
} {
  const parts = tierPriceParts('BASIC', 'LLC', 'FL');
  return {
    stateFee: formatCurrency(parts.stateFeeCents),
    total: formatCurrency(parts.totalCents),
    annual: formatCurrency(annualComplianceFor(FORMATION_STATES.FL, 'LLC').baseFeeCents),
  };
}

/**
 * Fill the cost-guide meta template. If the sentence is longer than 160
 * characters, drop the annual-report sentence.
 */
export function renderFloridaLlcCostMeta(template: string): string {
  const values = floridaLlcCostMetaValues();
  let filled = template;
  for (const [name, value] of Object.entries(values)) {
    filled = filled.replaceAll(`{${name}}`, value);
  }
  if (filled.length <= META_LIMIT) return filled;
  const sentences = filled.split('. ');
  if (sentences.length < 2) return filled;
  sentences.pop();
  return `${sentences.join('. ')}.`;
}
