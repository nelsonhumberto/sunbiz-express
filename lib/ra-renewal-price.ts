import { formatCurrency } from './utils';

/**
 * Florida Registered Agent renewal.
 *
 * The cents constant does not import lib/pricing.ts, so formation-states can
 * read it while pricing.ts is still loading. Wyoming and Delaware keep their
 * own renewalCents. Helpers format a customer's stored
 * RegisteredAgentService.renewalPriceCents and fall back to this default when
 * there is no row. They do not change the stored price or the catalog.
 */
export const RA_RENEWAL_PRICE_CENTS = 15_000;

/** Cents charged for this customer's next Registered Agent renewal. */
export function raRenewalChargeCents(renewalPriceCents: number | null | undefined): number {
  return renewalPriceCents ?? RA_RENEWAL_PRICE_CENTS;
}

/** USD label for a customer's Registered Agent renewal price. */
export function formatRaRenewalPrice(renewalPriceCents: number | null | undefined): string {
  return formatCurrency(raRenewalChargeCents(renewalPriceCents));
}
