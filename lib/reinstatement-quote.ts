/**
 * Florida LLC reinstatement quote.
 *
 * State fees are calculated here, not in the annual-report checkout. A later
 * change can switch the annual-report lines over to getFloridaAnnualReportStateFees
 * once that helper is on main. Until then, the figures below match the
 * Division of Corporations fee schedule:
 *   https://dos.fl.gov/sunbiz/forms/fees/llc-fees/
 *   https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/
 *
 *   - LLC reinstatement fee: $100
 *   - Annual report: $138.75 for each unpaid year
 *   - Late fee: $400 for each unpaid year filed after May 1 of that year
 *     (America/New_York). May 1 itself is still on time.
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

/**
 * True when an annual report for `reportYear` is filed after May 1 of that
 * year. Compared as a civil date in America/New_York, so May 1 at 11:59 p.m.
 * Eastern is still on time and May 2 is late.
 */
export function floridaAnnualReportYearIsLate(reportYear: number, now: Date = new Date()): boolean {
  const today = floridaCivilDate(now);
  if (today.year > reportYear) return true;
  if (today.year < reportYear) return false;
  if (today.month > 5) return true;
  if (today.month === 5 && today.day > 1) return true;
  return false;
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
  kind: 'service' | 'reinstatement' | 'annual_report' | 'late_fee';
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
  lateFeeCents: number;
  lateYears: number[];
  /** Reinstatement fee + annual reports + late fees. */
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
  const lateEach = FL.fees.annualReportLateFee;
  const lateYears = years.filter((year) => floridaAnnualReportYearIsLate(year, now));

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
    if (lateYears.includes(year)) {
      lines.push({
        id: `late-${year}`,
        kind: 'late_fee',
        year,
        cents: lateEach,
        statePassThrough: true,
      });
    }
  }

  const annualReportCents = perYear * years.length;
  const lateFeeCents = lateEach * lateYears.length;
  const stateFeeCents = reinstatementFeeCents + annualReportCents + lateFeeCents;
  return {
    serviceCents,
    reinstatementFeeCents,
    annualReportCents,
    annualReportYearCount: years.length,
    lateFeeCents,
    lateYears,
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
  lateYears: number[];
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
  lateFeeCents: number;
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
