import {
  ANNUAL_REPORT_SERVICE_FEE_CENTS,
  getFloridaAnnualReportStateFees,
  RA_ANNUAL_SERVICE_FEE_CENTS,
} from '@/lib/pricing';
import { annualComplianceFor, getFormationState, type StateCode } from '@/lib/formation-states';

/**
 * Server quote for an annual-report checkout. Florida adds the $400 late
 * fee from getFloridaAnnualReportStateFees. Other states keep their base fee.
 * The late fee is stored on the order and included in the payment's state fee.
 */
export function quoteAnnualReport(
  stateCode: StateCode,
  entityType: 'LLC' | 'CORP',
  useOurRa: boolean,
  reportYear: number,
  now: Date = new Date(),
) {
  const raFee = useOurRa ? RA_ANNUAL_SERVICE_FEE_CENTS : 0;
  const base = annualComplianceFor(getFormationState(stateCode), entityType);
  const florida =
    stateCode === 'FL'
      ? getFloridaAnnualReportStateFees(reportYear, now, { entityType })
      : null;
  const filingFeeCents = florida ? florida.filingFeeCents : base.baseFeeCents;
  const lateFeeCents = florida ? florida.lateFeeCents : 0;
  const stateFilingFeeCents = filingFeeCents + lateFeeCents;
  return {
    filingFeeCents,
    lateFeeCents,
    stateFilingFeeCents,
    raFee,
    totalCents: ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFilingFeeCents + raFee,
  };
}
