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
 * May is Eastern Daylight Time (UTC-4). January is Eastern Standard Time (UTC-5).
 * May 1, 2026 11:59 PM ET = 2026-05-02T03:59:00Z.
 * May 2, 2026 12:00 AM ET = 2026-05-02T04:00:00Z.
 */
const MAY_1_1159_PM_ET = new Date('2026-05-02T03:59:00.000Z');
const MAY_2_1200_AM_ET = new Date('2026-05-02T04:00:00.000Z');
const JANUARY_15_NOON_ET = new Date('2026-01-15T17:00:00.000Z');

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
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** Order summary: $80 service fee + state filing fee + late fee line. */
function uiTotal(now: Date, entityType: EntityType = 'LLC', enabled?: boolean) {
  const fees = getFloridaAnnualReportStateFees(now, { entityType, enabled });
  return ANNUAL_REPORT_SERVICE_FEE_CENTS + fees.filingFeeCents + fees.lateFeeCents;
}

/** Payment intent and actions: $80 service fee + helper state total. */
function serverTotal(now: Date, entityType: EntityType = 'LLC', enabled?: boolean) {
  const fees = getFloridaAnnualReportStateFees(now, { entityType, enabled });
  return ANNUAL_REPORT_SERVICE_FEE_CENTS + fees.totalCents;
}

describe('Florida annual report late fee', () => {
  it('charges no late fee on May 1 at 11:59 PM ET', () => {
    expect(easternParts(MAY_1_1159_PM_ET)).toMatchObject({
      month: '05',
      day: '01',
      hour: '23',
      minute: '59',
    });
    const fees = getFloridaAnnualReportStateFees(MAY_1_1159_PM_ET);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.totalCents).toBe(13_875);
    expect(uiTotal(MAY_1_1159_PM_ET)).toBe(21_875);
  });

  it('charges the $400 late fee on May 2 at 12:00 AM ET', () => {
    expect(easternParts(MAY_2_1200_AM_ET)).toMatchObject({
      month: '05',
      day: '02',
      hour: '00',
      minute: '00',
    });
    const fees = getFloridaAnnualReportStateFees(MAY_2_1200_AM_ET);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.lateFeeCents).toBe(40_000);
    expect(fees.totalCents).toBe(13_875 + 40_000);
    expect(uiTotal(MAY_2_1200_AM_ET)).toBe(61_875);
  });

  it('charges no late fee in January', () => {
    expect(easternParts(JANUARY_15_NOON_ET).month).toBe('01');
    const fees = getFloridaAnnualReportStateFees(JANUARY_15_NOON_ET);
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(uiTotal(JANUARY_15_NOON_ET)).toBe(21_875);
  });

  it('the server total equals the UI total', () => {
    expect(FL_AR_LATE_FEE_ENABLED).toBe(true);
    expect(ANNUAL_REPORT_SERVICE_FEE_CENTS).toBe(8_000);

    for (const now of [MAY_1_1159_PM_ET, MAY_2_1200_AM_ET, JANUARY_15_NOON_ET]) {
      for (const entityType of ['LLC', 'CORP'] as const) {
        expect(serverTotal(now, entityType)).toBe(uiTotal(now, entityType));
      }
    }

    // On time: $80 + $138.75. After May 1: those two lines plus $400.
    expect(uiTotal(MAY_1_1159_PM_ET, 'LLC')).toBe(8_000 + 13_875);
    expect(serverTotal(MAY_2_1200_AM_ET, 'LLC')).toBe(8_000 + 13_875 + 40_000);
    expect(serverTotal(MAY_1_1159_PM_ET, 'CORP')).toBe(8_000 + 15_000);
    expect(serverTotal(MAY_2_1200_AM_ET, 'CORP')).toBe(8_000 + 15_000 + 40_000);

    const late = getFloridaAnnualReportStateFees(MAY_2_1200_AM_ET);
    expect(late.filingFeeCents).toBe(13_875);
    expect(late.lateFeeCents).toBe(40_000);
    expect(ANNUAL_REPORT_SERVICE_FEE_CENTS).toBe(8_000);

    const files = [
      'app/api/stripe/payment-intent/route.ts',
      'actions/annual-report.ts',
      'components/dashboard/AnnualReportForm.tsx',
      'components/marketing/GuestAnnualReportForm.tsx',
    ];
    for (const file of files) {
      expect(readFileSync(file, 'utf8')).toContain('getFloridaAnnualReportStateFees');
    }
    expect(readFileSync('components/dashboard/AnnualReportForm.tsx', 'utf8')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFees.totalCents',
    );
    expect(readFileSync('components/marketing/GuestAnnualReportForm.tsx', 'utf8')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFees.totalCents',
    );
    expect(readFileSync('app/api/stripe/payment-intent/route.ts', 'utf8')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFeeCents',
    );
    expect(readFileSync('actions/annual-report.ts', 'utf8')).toContain(
      'ANNUAL_REPORT_SERVICE_FEE_CENTS + stateFilingFeeCents',
    );

    const en = JSON.parse(readFileSync('messages/en.json', 'utf8')) as {
      annualReport: { lateFee: string };
      annualReportForm: { lateFee: string };
    };
    const es = JSON.parse(readFileSync('messages/es.json', 'utf8')) as {
      annualReport: { lateFee: string };
      annualReportForm: { lateFee: string };
    };
    expect(en.annualReport.lateFee).toBe('Late filing fee (Florida)');
    expect(en.annualReportForm.lateFee).toBe('Late filing fee (Florida)');
    expect(es.annualReport.lateFee).toBe('Recargo por presentación tardía (Florida)');
    expect(es.annualReportForm.lateFee).toBe('Recargo por presentación tardía (Florida)');
  });

  it('charges no late fee when the flag is false', () => {
    const fees = getFloridaAnnualReportStateFees(MAY_2_1200_AM_ET, { enabled: false });
    expect(fees.lateFeeCents).toBe(0);
    expect(fees.filingFeeCents).toBe(13_875);
    expect(fees.totalCents).toBe(13_875);
    expect(serverTotal(MAY_2_1200_AM_ET, 'LLC', false)).toBe(21_875);
    expect(serverTotal(MAY_2_1200_AM_ET, 'LLC', false)).toBe(
      uiTotal(MAY_2_1200_AM_ET, 'LLC', false),
    );
  });
});
