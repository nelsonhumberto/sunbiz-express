import { RA_RENEWAL_PRICE_CENTS } from './pricing';
import { formatCurrency } from './utils';

/**
 * Cents for this customer's next Registered Agent renewal.
 * Matches the dashboard renewal charge (`RegisteredAgentService.renewalPriceCents`).
 * A missing snapshot falls back to the current default. It does not change the stored price.
 */
export function raRenewalChargeCents(renewalPriceCents: number | null | undefined): number {
  return renewalPriceCents ?? RA_RENEWAL_PRICE_CENTS;
}

/** USD label for a customer's Registered Agent renewal price. */
export function formatRaRenewalPrice(renewalPriceCents: number | null | undefined): string {
  return formatCurrency(raRenewalChargeCents(renewalPriceCents));
}
