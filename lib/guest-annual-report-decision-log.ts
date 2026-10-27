import {
  floridaFilingYear,
  isFloridaEntityActive,
  isFloridaEntityDissolved,
  normalizeFloridaDocumentKey,
  type GuestAnnualReportOffer,
} from '@/lib/guest-annual-report-offer';
import { floridaEasternYear } from '@/lib/pricing';

export type GuestAnnualReportDecisionSource = 'candidate' | 'sunbiz_daily' | 'scraper';

export function guestAnnualReportDecisionResult(
  offer: GuestAnnualReportOffer,
): 'sellable' | 'unconfirmed' | 'not_yet_due' | 'dissolved' | 'already_filed' {
  if (offer.kind === 'sell') return 'sellable';
  return offer.kind;
}

/**
 * Which input produced the offer. Live status, formation year, and a live
 * filed year come from Sunbiz Daily, unless the scraper supplied that filed year.
 * Every other result, including a missing candidate row, comes from the table.
 */
export function guestAnnualReportDecisionSource(input: {
  lookupOk: boolean;
  status?: string;
  filedYears?: number[] | null;
  eventFiledYears?: number[] | null;
  fileDate?: string | null;
  now?: Date;
  scraperUsed: boolean;
}): GuestAnnualReportDecisionSource {
  if (!input.lookupOk) return 'sunbiz_daily';
  const status = input.status;
  if (isFloridaEntityDissolved(status) || ((status ?? '').trim() && !isFloridaEntityActive(status))) {
    return 'sunbiz_daily';
  }
  const reportYear = floridaEasternYear(input.now ?? new Date());
  const formed = floridaFilingYear(input.fileDate);
  if (formed !== null && formed >= reportYear) return 'sunbiz_daily';
  const eventYears = input.eventFiledYears ?? [];
  if (input.filedYears?.includes(reportYear) || eventYears.includes(reportYear)) {
    return input.scraperUsed ? 'scraper' : 'sunbiz_daily';
  }
  return 'candidate';
}

function logDocumentNumber(value: string): string | null {
  const key = normalizeFloridaDocumentKey(value);
  // A company name with the spaces removed can look like an id. A Sunbiz
  // document number always contains a digit.
  if (!/^[A-Z][A-Z0-9]{4,19}$/.test(key) || !/\d/.test(key)) return null;
  return key;
}

/**
 * One JSON line for the guest annual report decision.
 * The document number is the only identifier. No name, address, or email.
 */
export function logGuestAnnualReportDecision(input: {
  documentNumber: string;
  offer: GuestAnnualReportOffer;
  candidatePresent: boolean;
  sunbizDailyStatus?: string | null;
  scraperUsed: boolean;
  lookupOk: boolean;
  filedYears?: number[] | null;
  eventFiledYears?: number[] | null;
  fileDate?: string | null;
  now?: Date;
}): void {
  const status = input.sunbizDailyStatus?.trim() || null;
  const payload = {
    event: 'guest_annual_report_decision',
    documentNumber: logDocumentNumber(input.documentNumber),
    result: guestAnnualReportDecisionResult(input.offer),
    source: guestAnnualReportDecisionSource({
      lookupOk: input.lookupOk,
      status: status ?? undefined,
      filedYears: input.filedYears,
      eventFiledYears: input.eventFiledYears,
      fileDate: input.fileDate,
      now: input.now,
      scraperUsed: input.scraperUsed,
    }),
    candidateRow: input.candidatePresent ? 'present' : 'absent',
    sunbizDailyStatus: status ? status.slice(0, 40) : null,
    scraperUsed: input.scraperUsed ? 'yes' : 'no',
  };
  console.info(JSON.stringify(payload));
}
