import { safeParseJson } from '@/lib/utils';
import {
  computeCost,
  type AddOnSlug,
  type EntityType,
  type TierSlug,
} from '@/lib/pricing';
import {
  ACTIVE_FORMATION_STATES,
  FORMATION_STATE_UNAVAILABLE,
  type StateCode,
} from '@/lib/formation-states';

/** Thrown when a quote is asked to price a state that is not for sale. */
export class InactiveFormationStateError extends Error {
  readonly code = 'inactive_formation_state';
  constructor() {
    super(FORMATION_STATE_UNAVAILABLE.en);
    this.name = 'InactiveFormationStateError';
  }
}

/** Columns written on Filing. Customer totals are recomputed, never trusted. */
export interface FilingTotalColumns {
  stateFeeCents: number;
  serviceFeeCents: number;
  addOnsTotalCents: number;
  totalCents: number;
}

export interface DraftQuoteInput {
  entityType: string;
  serviceTier: string;
  state: string | null;
  optionalDetails: string | null;
  filingAdditionalServices?: { service: { serviceSlug: string } }[] | null;
}

function asStateCode(input: string | null | undefined): StateCode {
  const upper = (input ?? '').trim().toUpperCase();
  if (ACTIVE_FORMATION_STATES.includes(upper as StateCode)) return upper as StateCode;
  throw new InactiveFormationStateError();
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Current package plus selected add-ons from lib/pricing.ts.
 * A stored Filing.totalCents is not an input.
 */
export function quoteDraftFiling(filing: DraftQuoteInput): FilingTotalColumns {
  const entityType: EntityType = filing.entityType === 'CORP' ? 'CORP' : 'LLC';
  const tier = filing.serviceTier as TierSlug;
  const optional = safeParseJson<Record<string, unknown> | null>(filing.optionalDetails, null);
  const processingOptionId =
    optional && typeof optional.processingOption === 'string' ? optional.processingOption : undefined;
  const addOnSlugs = (filing.filingAdditionalServices ?? []).map(
    (row) => row.service.serviceSlug as AddOnSlug,
  );
  const breakdown = computeCost({
    entityType,
    tier,
    addOnSlugs,
    state: asStateCode(filing.state),
    processingOptionId,
  });
  return {
    stateFeeCents: breakdown.governmentRemittanceCents,
    serviceFeeCents: breakdown.packageMarginCents,
    addOnsTotalCents: breakdown.addOnsCents,
    totalCents: breakdown.totalCents,
  };
}

export function filingTotalsChanged(
  stored: Partial<FilingTotalColumns> | null | undefined,
  next: FilingTotalColumns,
): boolean {
  return (
    numberOrZero(stored?.stateFeeCents) !== next.stateFeeCents ||
    numberOrZero(stored?.serviceFeeCents) !== next.serviceFeeCents ||
    numberOrZero(stored?.addOnsTotalCents) !== next.addOnsTotalCents ||
    numberOrZero(stored?.totalCents) !== next.totalCents
  );
}
