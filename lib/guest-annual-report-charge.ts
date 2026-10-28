import 'server-only';
import { quoteAnnualReport } from '@/lib/annual-report-quote';
import { floridaEasternYear } from '@/lib/pricing';
import { fetchFloridaEntityDetailByDocumentNumber, floridaLookupUsedScraper, type FloridaEntityDetail } from '@/lib/sunbiz';
import { logGuestAnnualReportDecision } from '@/lib/guest-annual-report-decision-log';
import {
  annualReportYearsOf,
  guestAnnualReportOffer,
  guestAnnualReportRefusal,
  pricedFloridaEntityType,
  type GuestAnnualReportOffer,
} from '@/lib/guest-annual-report-offer';
import { findSunbizArCandidate } from '@/lib/sunbiz-ar-candidate';

export type GuestAnnualReportCharge =
  | {
      ok: true;
      quote: ReturnType<typeof quoteAnnualReport>;
      reportYear: number;
      entityType: 'LLC' | 'CORP';
      offer: GuestAnnualReportOffer;
    }
  | {
      ok: false;
      code:
        | 'company_dissolved'
        | 'annual_report_filed'
        | 'annual_report_not_due'
        | 'annual_report_unconfirmed';
      error: string;
      offer: GuestAnnualReportOffer;
    };

function refusalCode(
  offer: GuestAnnualReportOffer,
): 'company_dissolved' | 'annual_report_filed' | 'annual_report_not_due' | 'annual_report_unconfirmed' {
  if (offer.kind === 'dissolved') return 'company_dissolved';
  if (offer.kind === 'already_filed') return 'annual_report_filed';
  if (offer.kind === 'not_yet_due') return 'annual_report_not_due';
  return 'annual_report_unconfirmed';
}

/**
 * Price a guest annual report at PaymentIntent time and again at submit.
 * A dissolved, already-filed, not-yet-due, or unconfirmed company is not charged.
 * A failed lookup is unconfirmed. The entity type the customer picked is not the price.
 */
export async function resolveGuestAnnualReportCharge(input: {
  documentNumber: string;
  entityType: 'LLC' | 'CORP';
  useOurRa: boolean;
  now?: Date;
  locale?: 'en' | 'es';
}): Promise<GuestAnnualReportCharge> {
  const now = input.now ?? new Date();
  const locale = input.locale ?? 'en';
  let entityType = input.entityType;
  let offer: GuestAnnualReportOffer = { kind: 'unconfirmed' };
  try {
    const detail: FloridaEntityDetail = await fetchFloridaEntityDetailByDocumentNumber(input.documentNumber);
    const candidate = await findSunbizArCandidate(input.documentNumber);
    const filedYears = annualReportYearsOf(detail);
    offer = guestAnnualReportOffer({
      lookupOk: true,
      status: detail.status,
      filedYears,
      eventFiledYears: detail.event_filed_years,
      fileDate: detail.file_date,
      now,
      candidate,
    });
    if (offer.kind === 'sell') {
      const priced = pricedFloridaEntityType(input.documentNumber, detail);
      if (!priced) offer = { kind: 'unconfirmed' };
      else entityType = priced;
    }
    logGuestAnnualReportDecision({
      documentNumber: input.documentNumber,
      offer,
      candidatePresent: candidate != null,
      sunbizDailyStatus: detail.status,
      scraperUsed: floridaLookupUsedScraper(detail),
      lookupOk: true,
      filedYears,
      eventFiledYears: detail.event_filed_years,
      fileDate: detail.file_date,
      now,
    });
  } catch {
    offer = { kind: 'unconfirmed' };
    const candidate = await findSunbizArCandidate(input.documentNumber);
    logGuestAnnualReportDecision({
      documentNumber: input.documentNumber,
      offer,
      candidatePresent: candidate != null,
      sunbizDailyStatus: null,
      scraperUsed: false,
      lookupOk: false,
      now,
    });
  }

  if (offer.kind !== 'sell') {
    return {
      ok: false,
      code: refusalCode(offer),
      error: guestAnnualReportRefusal(offer, locale) ?? 'We could not start that filing.',
      offer,
    };
  }

  const reportYear = floridaEasternYear(now);
  return {
    ok: true,
    quote: quoteAnnualReport('FL', entityType, input.useOurRa, reportYear, now),
    reportYear,
    entityType,
    offer,
  };
}
