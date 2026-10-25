import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANNUAL_REPORT_SERVICE_FEE_CENTS,
  FL_AR_LATE_FEE_ENABLED,
  getFloridaAnnualReportStateFees,
  type EntityType,
} from '@/lib/pricing';

/**
 * Fixed instants, not the machine timezone.
 * May and October are Eastern Daylight Time (UTC-4). January is Eastern Standard Time (UTC-5).
 * May 1, 2026 11:59 PM ET = 2026-05-02T03:59:00Z.
 * May 2, 2026 12:00 AM ET = 2026-05-02T04:00:00Z.
 * Oct 15, 2026 noon ET = 2026-10-15T16:00:00Z.
 */
const MAY_1_1159_PM_ET = new Date('2026-05-02T03:59:00.000Z');
const MAY_2_1200_AM_ET = new Date('2026-05-02T04:00:00.000Z');
const JANUARY_15_NOON_ET = new Date('2026-01-15T17:00:00.000Z');
const OCTOBER_15_NOON_ET = new Date('2026-10-15T16:00:00.000Z');
const JANUARY_2027_NOON_ET = new Date('2027-01-15T17:00:00.000Z');

function easternParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** Order summary: $99 service fee + state filing fee + late fee line. */
function uiTotal(
  reportYear: number,
  now: Date,
  entityType: EntityType = 'LLC',
  enabled?: boolean,
) {
  const fees = getFloridaAnnualReportStateFees(reportYear, now, { entityType, enabled });
  return ANNUAL_REPORT_SERVICE_FEE_CENTS + fees.filingFeeCents + fees.lateFeeCents;
}

/** Payment intent and actions: $99 service fee + helper state total. */
function serverTotal(
  reportYear: number,
  now: Date,
  entityType: EntityType = 'LLC',
  enabled?: boolean,
) {
  const fees = getFloridaAnnualReportStateFees(reportYear, now, { entityType, enabled });
  return ANNUAL_REPORT_SERVICE_FEE_CENTS + fees.totalCents;
}

describe('Florida annual report late fee', () => {
  it('charges no late fee for a 2027 report filed in October 2026', () => {
    expect(easternParts(OCTOBER_15_NOON_ET)).toMatchObject({
      year: '2026',
      month: '10',
      day: '15',
    });
    const fees = getFloridaAnnualReportStateFees(2027, OCTOBER_15_NOON_ET);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.totalCents).toBe(13_875);
    expect(uiTotal(2027, OCTOBER_15_NOON_ET)).toBe(23_775);
  });

  it('charges the $400 late fee for a 2026 report filed in October 2026', () => {
    const fees = getFloridaAnnualReportStateFees(2026, OCTOBER_15_NOON_ET);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.lateFeeCents).toBe(40_000);
    expect(fees.totalCents).toBe(13_875 + 40_000);
    expect(uiTotal(2026, OCTOBER_15_NOON_ET)).toBe(63_775);
  });

  it('charges no late fee for a 2026 report on May 1 at 11:59 PM ET', () => {
    expect(easternParts(MAY_1_1159_PM_ET)).toMatchObject({
      year: '2026',
      month: '05',
      day: '01',
      hour: '23',
      minute: '59',
    });
    const fees = getFloridaAnnualReportStateFees(2026, MAY_1_1159_PM_ET);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.totalCents).toBe(13_875);
    expect(uiTotal(2026, MAY_1_1159_PM_ET)).toBe(23_775);
  });

  it('charges the $400 late fee for a 2026 report on May 2', () => {
    expect(easternParts(MAY_2_1200_AM_ET)).toMatchObject({
      year: '2026',
      month: '05',
      day: '02',
      hour: '00',
      minute: '00',
    });
    const fees = getFloridaAnnualReportStateFees(2026, MAY_2_1200_AM_ET);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.lateFeeCents).toBe(40_000);
    expect(fees.totalCents).toBe(13_875 + 40_000);
    expect(uiTotal(2026, MAY_2_1200_AM_ET)).toBe(63_775);
  });

  it('charges no late fee in January of the report year', () => {
    expect(easternParts(JANUARY_15_NOON_ET).month).toBe('01');
    const fees = getFloridaAnnualReportStateFees(2026, JANUARY_15_NOON_ET);
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(uiTotal(2026, JANUARY_15_NOON_ET)).toBe(23_775);
  });

  it('charges the late fee when the calendar year is after the report year', () => {
    const fees = getFloridaAnnualReportStateFees(2026, JANUARY_2027_NOON_ET);
    expect(fees.lateFeeCents).toBe(40_000);
    expect(uiTotal(2026, JANUARY_2027_NOON_ET)).toBe(63_775);
  });

  it('the server total equals the UI total', () => {
    expect(FL_AR_LATE_FEE_ENABLED).toBe(true);
    expect(ANNUAL_REPORT_SERVICE_FEE_CENTS).toBe(9_900);

    const cases = [
      { reportYear: 2027, now: OCTOBER_15_NOON_ET },
      { reportYear: 2026, now: OCTOBER_15_NOON_ET },
      { reportYear: 2026, now: MAY_1_1159_PM_ET },
      { reportYear: 2026, now: MAY_2_1200_AM_ET },
      { reportYear: 2026, now: JANUARY_15_NOON_ET },
    ];
    for (const { reportYear, now } of cases) {
      for (const entityType of ['LLC', 'CORP'] as const) {
        expect(serverTotal(reportYear, now, entityType)).toBe(uiTotal(reportYear, now, entityType));
      }
    }

    expect(uiTotal(2026, MAY_1_1159_PM_ET, 'LLC')).toBe(9_900 + 13_875);
    expect(serverTotal(2026, MAY_2_1200_AM_ET, 'LLC')).toBe(9_900 + 13_875 + 40_000);
    expect(serverTotal(2027, OCTOBER_15_NOON_ET, 'LLC')).toBe(9_900 + 13_875);
    expect(serverTotal(2026, OCTOBER_15_NOON_ET, 'CORP')).toBe(9_900 + 15_000 + 40_000);
    expect(serverTotal(2026, MAY_1_1159_PM_ET, 'CORP')).toBe(9_900 + 15_000);

    const files = [
      'lib/annual-report-quote.ts',
      'components/dashboard/AnnualReportForm.tsx',
    ];
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).toContain('getFloridaAnnualReportStateFees');
    }
    expect(readFileSync('lib/annual-report-quote.ts', 'utf8')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFilingFeeCents',
    );
    expect(readFileSync('components/dashboard/AnnualReportForm.tsx', 'utf8')).toContain(
      'getFloridaAnnualReportStateFees(props.reportYear',
    );
    expect(readFileSync('components/dashboard/AnnualReportForm.tsx', 'utf8')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFees.totalCents',
    );
    expect(readFileSync('components/marketing/GuestAnnualReportForm.tsx', 'utf8')).toContain(
      "quoteAnnualReport('FL', entityType, useOurRa, reportYear, now)",
    );
    expect(readFileSync('components/marketing/GuestAnnualReportForm.tsx', 'utf8')).toContain(
      'quote.totalCents',
    );
    expect(readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8')).toContain(
      'quoteAnnualReport(',
    );
    expect(readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8')).toContain(
      'report.reportYear',
    );
    expect(readFileSync('actions/annual-report.ts', 'utf8')).toContain(
      "quoteAnnualReport('FL', data.entityType, data.useOurRa, reportYear, now)",
    );
    expect(readFileSync('actions/annual-report.ts', 'utf8')).toContain('floridaEasternYear(now)');

    const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
      annualReport: { lateFee: string };
      annualReportForm: { lateFee: string };
    };
    const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
      annualReport: { lateFee: string };
      annualReportForm: { lateFee: string };
      annualReportPage: {
        llcBadge: string;
        corpBadge: string;
        lateFeeNote: string;
        footnote: string;
      };
    };
    expect(en.annualReport.lateFee).toBe('Late filing fee (Florida)');
    expect(en.annualReportForm.lateFee).toBe('Late filing fee (Florida)');
    expect(es.annualReport.lateFee).toBe('Recargo por presentación tardía (Florida)');
    expect(es.annualReportForm.lateFee).toBe('Recargo por presentación tardía (Florida)');
    expect(es.annualReportPage.llcBadge).toBe('LLC desde {price}');
    expect(es.annualReportPage.corpBadge).toBe('Corp. desde {price}');
    expect(es.annualReportPage.lateFeeNote).toBe(
      'Florida cobra un recargo de $400 si presentas el reporte después del 1 de mayo.',
    );
    expect(es.annualReportPage.footnote).toContain('precio a tiempo');

    const page = readFileSync('app/(marketing)/file-annual-report/page.tsx', 'utf8');
    expect(page).toContain('LLC from');
    expect(page).toContain('Florida adds a $400 late fee for reports filed after May 1.');
    expect(page).toContain('.filingFeeCents');
    expect(page).not.toContain('all-in');
  });

  it('charges no late fee when the flag is false', () => {
    const fees = getFloridaAnnualReportStateFees(2026, MAY_2_1200_AM_ET, { enabled: false });
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.totalCents).toBe(13_875);
    expect(serverTotal(2026, MAY_2_1200_AM_ET, 'LLC', false)).toBe(23_775);
    expect(serverTotal(2026, MAY_2_1200_AM_ET, 'LLC', false)).toBe(
      uiTotal(2026, MAY_2_1200_AM_ET, 'LLC', false),
    );
  });
});
