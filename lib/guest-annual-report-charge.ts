import 'server-only';
import { quoteAnnualReport } from '@/lib/annual-report-quote';
import { floridaEasternYear } from '@/lib/pricing';
import { fetchFloridaEntityDetailByDocumentNumber, type FloridaEntityDetail } from '@/lib/sunbiz';
import {
  annualReportYearsOf,
  floridaFilingEntityType,
  guestAnnualReportOffer,
  guestAnnualReportRefusal,
  type GuestAnnualReportOffer,
} from '@/lib/guest-annual-report-offer';

export type GuestAnnualReportCharge =
  | {
      ok: true;
      quote: ReturnType<typeof quoteAnnualReport>;
      reportYear: number;
      entityType: 'LLC' | 'CORP';
      offer: GuestAnnualReportOffer;
    }
  | { ok: false; code: 'company_dissolved' | 'annual_report_filed'; error: string; offer: GuestAnnualReportOffer };

/**
 * Price a guest annual report at PaymentIntent time.
 * A dissolved or already-filed company is not charged.
 * A failed lookup still quotes the current year from the entity type the customer entered.
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
  let offer: GuestAnnualReportOffer = { kind: 'lookup_failed' };
  try {
    const detail: FloridaEntityDetail = await fetchFloridaEntityDetailByDocumentNumber(input.documentNumber);
    offer = guestAnnualReportOffer({
      lookupOk: true,
      status: detail.status,
      filedYears: annualReportYearsOf(detail),
      now,
    });
    if (offer.kind === 'sell') {
      entityType = floridaFilingEntityType(detail);
    }
  } catch {
    offer = { kind: 'lookup_failed' };
  }

  if (offer.kind === 'dissolved' || offer.kind === 'already_filed') {
    return {
      ok: false,
      code: offer.kind === 'dissolved' ? 'company_dissolved' : 'annual_report_filed',
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
