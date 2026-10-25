/**
 * Florida LLC reinstatement quote.
 *
 * State fees are calculated here. Reinstatement does not add an annual-report
 * late fee. The total is the LaunchForma service fee plus
 * Florida's reinstatement fee plus $138.75 for each annual report year due:
 *   https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/
 *   https://dos.fl.gov/sunbiz/forms/fees/
 *
 *   - LaunchForma service fee: $149
 *   - LLC reinstatement fee: $100
 *   - Annual report: $138.75 for each year due
 */

import { FL } from '@/lib/florida';
import { REINSTATEMENT_SERVICE_FEE_CENTS } from '@/lib/pricing';

export class ReinstatementQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReinstatementQuoteError';
  }
}

export interface FloridaCivilDate {
  year: number;
  month: number;
  day: number;
}

/** Calendar date in America/New_York, independent of the server timezone. */
export function floridaCivilDate(now: Date = new Date()): FloridaCivilDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new ReinstatementQuoteError('Could not read the Florida date.');
    return Number(value);
  };
  return { year: read('year'), month: read('month'), day: read('day') };
}

/** Years the reinstatement form can offer, newest first. */
export function reinstatementYearChoices(now: Date = new Date(), span = 10): number[] {
  const { year } = floridaCivilDate(now);
  const years: number[] = [];
  for (let cursor = year; cursor > year - span && cursor >= 1990; cursor -= 1) {
    years.push(cursor);
  }
  return years;
}

export interface ReinstatementFeeLine {
  id: string;
  kind: 'service' | 'reinstatement' | 'annual_report';
  year?: number;
  cents: number;
  /** Florida fee passed through at cost. The service line is ours. */
  statePassThrough: boolean;
}

export interface ReinstatementQuote {
  serviceCents: number;
  reinstatementFeeCents: number;
  annualReportCents: number;
  annualReportYearCount: number;
  /** Reinstatement fee + annual reports. No late fee. */
  stateFeeCents: number;
  totalCents: number;
  years: number[];
  lines: ReinstatementFeeLine[];
}

export function quoteReinstatement(input: { years: number[]; now?: Date }): ReinstatementQuote {
  const now = input.now ?? new Date();
  const { year: currentYear } = floridaCivilDate(now);
  const years = [...new Set(input.years)].sort((a, b) => a - b);
  if (years.length < 1 || years.length > 15) {
    throw new ReinstatementQuoteError('Select the unpaid annual report years.');
  }
  for (const year of years) {
    if (!Number.isInteger(year) || year < 1990 || year > currentYear) {
      throw new ReinstatementQuoteError('Choose unpaid annual report years through the current year.');
    }
  }

  const serviceCents = REINSTATEMENT_SERVICE_FEE_CENTS;
  const reinstatementFeeCents = FL.fees.reinstatementLLC;
  const perYear = FL.fees.annualReportLLC;

  const lines: ReinstatementFeeLine[] = [
    { id: 'service', kind: 'service', cents: serviceCents, statePassThrough: false },
    {
      id: 'reinstatement',
      kind: 'reinstatement',
      cents: reinstatementFeeCents,
      statePassThrough: true,
    },
  ];
  for (const year of years) {
    lines.push({
      id: `annual-${year}`,
      kind: 'annual_report',
      year,
      cents: perYear,
      statePassThrough: true,
    });
  }

  const annualReportCents = perYear * years.length;
  const stateFeeCents = reinstatementFeeCents + annualReportCents;
  return {
    serviceCents,
    reinstatementFeeCents,
    annualReportCents,
    annualReportYearCount: years.length,
    stateFeeCents,
    totalCents: serviceCents + stateFeeCents,
    years,
    lines,
  };
}

export interface ReinstatementOrderSnapshot {
  kind: 'reinstatement';
  documentNumber: string;
  companyName: string;
  sunbizStatus: string | null;
  years: number[];
  contactName: string;
  email: string;
  phone: string;
  officerName: string;
  officerTitle: string;
  changeNote: string | null;
  locale: 'en' | 'es';
  serviceCents: number;
  reinstatementFeeCents: number;
  annualReportCents: number;
  stateFeeCents: number;
  totalCents: number;
}

export function parseReinstatementSnapshot(raw: string | null | undefined): ReinstatementOrderSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ReinstatementOrderSnapshot;
    if (!parsed || parsed.kind !== 'reinstatement') return null;
    if (typeof parsed.documentNumber !== 'string' || typeof parsed.totalCents !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}
