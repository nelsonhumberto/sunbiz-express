import { floridaEasternYear } from '@/lib/pricing';

/**
 * Stable code for a failed company lookup. Callers translate it.
 * Never put an upstream message, env var, or stack detail in this value.
 */
export const GUEST_LOOKUP_FAILED = 'lookup_failed';

export type GuestAnnualReportOffer =
  | { kind: 'dissolved' }
  | { kind: 'already_filed'; reportYear: number; nextOpenYear: number }
  | { kind: 'not_yet_due'; reportYear: number; nextOpenYear: number }
  | { kind: 'sell'; reportYear: number }
  | { kind: 'unconfirmed' };

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
 * Year printed on a Florida filing date. Date-only values are not parsed as UTC,
 * so a January 1 date stays in that calendar year.
 */
export function floridaFilingYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-\d{2}-\d{2}/);
  if (iso) return Number(iso[1]);
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (us) return Number(us[3]);
  const named = text.match(/\b(19|20)\d{2}\b/);
  return named ? Number(named[0]) : null;
}

export function guestAnnualReportUnconfirmedMessage(locale: 'en' | 'es'): string {
  return locale === 'es'
    ? 'No pudimos confirmar en línea el estado del reporte anual de esta compañía.'
    : "We couldn't confirm this company's annual report status online.";
}

/**
 * What the guest annual report page may sell after a lookup.
 * Sell only when the formation year is before the report year and the current
 * report is known to be unfiled. Unknown status is not a sale.
 */
export function guestAnnualReportOffer(input: {
  lookupOk: boolean;
  status?: string;
  filedYears?: number[] | null;
  eventFiledYears?: number[] | null;
  fileDate?: string | null;
  now?: Date;
}): GuestAnnualReportOffer {
  if (!input.lookupOk) return { kind: 'unconfirmed' };
  if (isFloridaEntityDissolved(input.status) || ((input.status ?? '').trim() && !isFloridaEntityActive(input.status))) {
    return { kind: 'dissolved' };
  }
  const reportYear = floridaEasternYear(input.now ?? new Date());
  const formed = floridaFilingYear(input.fileDate);
  if (formed !== null && formed >= reportYear) {
    return { kind: 'not_yet_due', reportYear, nextOpenYear: formed + 1 };
  }
  const filed = input.filedYears;
  const eventYears = input.eventFiledYears ?? [];
  if (filed?.includes(reportYear) || eventYears.includes(reportYear)) {
    return { kind: 'already_filed', reportYear, nextOpenYear: reportYear + 1 };
  }
  if (formed === null || filed == null) return { kind: 'unconfirmed' };
  return { kind: 'sell', reportYear };
}

/**
 * Florida document numbers start with a type letter.
 * L is an LLC. P (profit), F (foreign profit), and N (nonprofit) are
 * corporation prefixes. lib/pricing.ts quotes every corporation annual
 * report at the $150 fee. It has no separate nonprofit price.
 * Any other prefix is unknown.
 */
const CORPORATION_DOCUMENT_PREFIXES = new Set(['P', 'F', 'N']);

export const DOCUMENT_NUMBER_REQUIRED = 'document_number_required';

export function normalizeFloridaDocumentKey(value: string | undefined): string {
  return (value ?? '').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toUpperCase();
}

export function entityTypeFromFloridaDocumentNumber(
  documentNumber: string,
): 'LLC' | 'CORP' | null {
  const prefix = normalizeFloridaDocumentKey(documentNumber).charAt(0);
  if (prefix === 'L') return 'LLC';
  if (CORPORATION_DOCUMENT_PREFIXES.has(prefix)) return 'CORP';
  return null;
}

/**
 * Price from the document prefix when it is known.
 * Otherwise use a non-empty Sunbiz filing label. An empty label is not an LLC.
 */
export function pricedFloridaEntityType(
  documentNumber: string,
  detail: { filing_type?: string; filing_type_display?: string },
): 'LLC' | 'CORP' | null {
  const fromPrefix = entityTypeFromFloridaDocumentNumber(documentNumber);
  if (fromPrefix) return fromPrefix;
  const label = `${detail.filing_type_display ?? ''} ${detail.filing_type ?? ''}`.trim();
  if (!label) return null;
  return floridaFilingEntityType(detail);
}

export function guestDocumentNumberRequiredMessage(locale: 'en' | 'es'): string {
  return locale === 'es' ? 'Escribe el número de documento.' : 'Enter the document number.';
}

/** True when Zod is reporting a missing document number, not a short one. */
export function isMissingDocumentNumberIssue(issue: {
  code: string;
  message: string;
  path: ReadonlyArray<PropertyKey>;
} | undefined): boolean {
  if (!issue || issue.path[0] !== 'documentNumber') return false;
  return (
    issue.code === 'invalid_type' ||
    issue.message === 'Required' ||
    issue.message === DOCUMENT_NUMBER_REQUIRED
  );
}

/**
 * Reuse a guest annual-report PaymentIntent only for this company.
 * A different document number or purpose must create a new PaymentIntent.
 */
export function guestAnnualReportPaymentIntentMatches(
  metadata: { purpose?: string; documentNumber?: string } | null | undefined,
  documentNumber: string,
): boolean {
  if (metadata?.purpose !== 'guest_annual_report') return false;
  const stored = normalizeFloridaDocumentKey(metadata.documentNumber);
  const requested = normalizeFloridaDocumentKey(documentNumber);
  return stored.length > 0 && stored === requested;
}

export function guestAnnualReportRefusal(offer: GuestAnnualReportOffer, locale: 'en' | 'es'): string | null {
  if (offer.kind === 'dissolved') {
    return locale === 'es'
      ? 'Esta compañía está disuelta y necesita restablecerse antes de que puedas presentar el reporte anual. No estamos vendiendo un trámite.'
      : 'This company is dissolved and needs reinstatement. We are not selling a filing.';
  }
  if (offer.kind === 'already_filed' || offer.kind === 'not_yet_due') {
    return locale === 'es'
      ? `Nada pendiente hasta el 1 de enero de ${offer.nextOpenYear}.`
      : `Nothing due until Jan 1, ${offer.nextOpenYear}.`;
  }
  if (offer.kind === 'unconfirmed') return guestAnnualReportUnconfirmedMessage(locale);
  return null;
}
