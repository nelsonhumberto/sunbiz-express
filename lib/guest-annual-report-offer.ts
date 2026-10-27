import { quoteAnnualReport } from '@/lib/annual-report-quote';
import { floridaEasternYear } from '@/lib/pricing';
import {
  fetchFloridaEntityDetailByDocumentNumber,
  type FloridaEntityDetail,
} from '@/lib/sunbiz';

/**
 * Stable code for a failed company lookup. Callers translate it.
 * Never put an upstream message, env var, or stack detail in this value.
 */
export const GUEST_LOOKUP_FAILED = 'lookup_failed';

export type GuestAnnualReportOffer =
  | { kind: 'dissolved' }
  | { kind: 'already_filed'; reportYear: number; nextOpenYear: number }
  | { kind: 'sell'; reportYear: number }
  | { kind: 'lookup_failed' };

export function isFloridaEntityActive(status: string | undefined): boolean {
  const value = (status ?? '').trim().toUpperCase();
  return value === 'A' || value === 'ACTIVE';
}

/** Inactive and administratively dissolved Florida records. */
export function isFloridaEntityDissolved(status: string | undefined): boolean {
  const value = (status ?? '').trim().toUpperCase();
  if (!value || isFloridaEntityActive(value)) return false;
  return value === 'I' || value === 'INACT' || value === 'INACTIVE' || value.includes('DISSOLV') || value.includes('INACT');
}

export function floridaFilingEntityType(detail: {
  filing_type?: string;
  filing_type_display?: string;
}): 'LLC' | 'CORP' {
  const label = `${detail.filing_type_display ?? ''} ${detail.filing_type ?? ''}`.toUpperCase();
  if (
    label.includes('LIMITED LIABILITY') ||
    label.includes('LLC') ||
    label.includes('L.L.C') ||
    label.includes('FLAL') ||
    label.includes('FORL')
  ) {
    return 'LLC';
  }
  if (!label.trim()) return 'LLC';
  return 'CORP';
}

/**
 * Filed years from a detail record.
 * `null` means the source did not include the annual report table.
 */
export function annualReportYearsOf(detail: {
  annual_reports?: { year: number }[] | null;
}): number[] | null {
  if (!detail.annual_reports) return null;
  return detail.annual_reports
    .map((row) => row.year)
    .filter((year) => Number.isInteger(year));
}

/**
 * What the guest annual report page may sell after a lookup.
 * A future report year is never offered. An already-filed current year is not sold.
 * Unknown filing history on an active company still sells the current year.
 */
export function guestAnnualReportOffer(input: {
  lookupOk: boolean;
  status?: string;
  filedYears?: number[] | null;
  now?: Date;
}): GuestAnnualReportOffer {
  if (!input.lookupOk) return { kind: 'lookup_failed' };
  if (isFloridaEntityDissolved(input.status) || ((input.status ?? '').trim() && !isFloridaEntityActive(input.status))) {
    return { kind: 'dissolved' };
  }
  const reportYear = floridaEasternYear(input.now ?? new Date());
  const filed = input.filedYears;
  if (filed?.includes(reportYear)) {
    return { kind: 'already_filed', reportYear, nextOpenYear: reportYear + 1 };
  }
  return { kind: 'sell', reportYear };
}

export function guestAnnualReportRefusal(offer: GuestAnnualReportOffer, locale: 'en' | 'es'): string | null {
  if (offer.kind === 'dissolved') {
    return locale === 'es'
      ? 'Esta compañía está disuelta y necesita reinstalación. No estamos vendiendo un trámite.'
      : 'This company is dissolved and needs reinstatement. We are not selling a filing.';
  }
  if (offer.kind === 'already_filed') {
    return locale === 'es'
      ? `Nada pendiente hasta el 1 de enero de ${offer.nextOpenYear}.`
      : `Nothing due until Jan 1, ${offer.nextOpenYear}.`;
  }
  return null;
}

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
