import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  guestAnnualReportDecisionResult,
  guestAnnualReportDecisionSource,
  logGuestAnnualReportDecision,
} from '@/lib/guest-annual-report-decision-log';

const NOW = new Date('2026-10-15T16:00:00.000Z');

describe('guest annual report decision log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the offer and the source that decided it', () => {
    expect(guestAnnualReportDecisionResult({ kind: 'sell', reportYear: 2026 })).toBe('sellable');
    expect(guestAnnualReportDecisionResult({ kind: 'unconfirmed' })).toBe('unconfirmed');
    expect(guestAnnualReportDecisionResult({ kind: 'not_yet_due', reportYear: 2026, nextOpenYear: 2027 })).toBe('not_yet_due');
    expect(guestAnnualReportDecisionResult({ kind: 'dissolved' })).toBe('dissolved');
    expect(guestAnnualReportDecisionSource({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: null,
      fileDate: '2015-04-10',
      now: NOW,
      scraperUsed: false,
    })).toBe('candidate');
    expect(guestAnnualReportDecisionSource({
      lookupOk: true,
      status: 'INACT',
      now: NOW,
      scraperUsed: false,
    })).toBe('sunbiz_daily');
    expect(guestAnnualReportDecisionSource({
      lookupOk: true,
      status: 'ADMIN DISSOLVED',
      now: NOW,
      scraperUsed: true,
    })).toBe('sunbiz_daily');
    expect(guestAnnualReportDecisionSource({
      lookupOk: true,
      status: 'ACTIVE',
      fileDate: '2026-10-19',
      now: NOW,
      scraperUsed: false,
    })).toBe('sunbiz_daily');
    expect(guestAnnualReportDecisionSource({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: [2026],
      fileDate: '2015-04-10',
      now: NOW,
      scraperUsed: true,
    })).toBe('scraper');
    expect(guestAnnualReportDecisionSource({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: [2026],
      fileDate: '2015-04-10',
      now: NOW,
      scraperUsed: false,
    })).toBe('sunbiz_daily');
    expect(guestAnnualReportDecisionSource({
      lookupOk: false,
      scraperUsed: false,
      now: NOW,
    })).toBe('sunbiz_daily');
  });

  it('writes one JSON line with the document number and no other personal data', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    logGuestAnnualReportDecision({
      documentNumber: 'l25000509630',
      offer: { kind: 'sell', reportYear: 2026 },
      candidatePresent: true,
      sunbizDailyStatus: 'ACTIVE',
      scraperUsed: false,
      lookupOk: true,
      filedYears: null,
      fileDate: '2015-04-10',
      now: NOW,
    });
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    const payload = JSON.parse(line) as Record<string, unknown>;
    expect(payload).toEqual({
      event: 'guest_annual_report_decision',
      documentNumber: 'L25000509630',
      result: 'sellable',
      source: 'candidate',
      candidateRow: 'present',
      sunbizDailyStatus: 'ACTIVE',
      scraperUsed: 'no',
    });
    expect(line).not.toMatch(/sourceFileDate|corporation_name|@|formationDate|arYears|Ada/i);

    info.mockClear();
    logGuestAnnualReportDecision({
      documentNumber: 'Southern Holdings LLC',
      offer: { kind: 'unconfirmed' },
      candidatePresent: false,
      sunbizDailyStatus: null,
      scraperUsed: false,
      lookupOk: false,
      now: NOW,
    });
    const hidden = JSON.parse(String(info.mock.calls[0][0])) as { documentNumber: string | null; result: string; candidateRow: string };
    expect(hidden.documentNumber).toBeNull();
    expect(hidden.result).toBe('unconfirmed');
    expect(hidden.candidateRow).toBe('absent');
    expect(String(info.mock.calls[0][0])).not.toContain('Southern');
  });
});
