/**
 * Price for the public annual-report checkout.
 *
 * This matches the amount submitGuestAnnualReport records today:
 * $80 service + the Florida base fee ($138.75 LLC, $150 corporation)
 * + optional $150 registered agent. The $400 late fee is intentionally
 * not included here. That charge is landing in a separate change behind
 * getFloridaAnnualReportStateFees.
 */

import {
  annualComplianceFor,
  getFormationState,
} from '@/lib/formation-states';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS, RA_ANNUAL_SERVICE_FEE_CENTS } from '@/lib/pricing';

export interface GuestAnnualReportPrice {
  serviceCents: number;
  stateFeeCents: number;
  raCents: number;
  totalCents: number;
}

export function guestAnnualReportPrice(
  entityType: 'LLC' | 'CORP',
  useOurRa: boolean,
): GuestAnnualReportPrice {
  const compliance = annualComplianceFor(getFormationState('FL'), entityType);
  const serviceCents = ANNUAL_REPORT_SERVICE_FEE_CENTS;
  const stateFeeCents = compliance.baseFeeCents;
  const raCents = useOurRa ? RA_ANNUAL_SERVICE_FEE_CENTS : 0;
  return {
    serviceCents,
    stateFeeCents,
    raCents,
    totalCents: serviceCents + stateFeeCents + raCents,
  };
}
