import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import { parseFloridaAnnualReportYears, readAnnualReportFilings } from '@/lib/sunbiz';
import { resolveGuestAnnualReportCharge } from '@/lib/guest-annual-report-charge';
import {
  GUEST_LOOKUP_FAILED,
  annualReportYearsOf,
  guestAnnualReportOffer,
  guestAnnualReportRefusal,
} from '@/lib/guest-annual-report-offer';

const fetchDetail = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/sunbiz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sunbiz')>('@/lib/sunbiz');
  return {
    ...actual,
    fetchFloridaEntityDetailByDocumentNumber: fetchDetail,
  };
});

const OCTOBER_15_NOON_ET = new Date('2026-10-15T16:00:00.000Z');
const DASH = /[\u2013\u2014]/;

describe('guest annual report offer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(OCTOBER_15_NOON_ET);
    fetchDetail.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sells nothing when the company is dissolved or inactive', () => {
    for (const status of ['I', 'INACT', 'INACTIVE', 'ADMIN DISSOLVED']) {
      expect(guestAnnualReportOffer({
        lookupOk: true,
        status,
        filedYears: [2024, 2025],
        now: OCTOBER_15_NOON_ET,
      })).toEqual({ kind: 'dissolved' });
    }
    expect(guestAnnualReportRefusal(
      { kind: 'dissolved' },
      'en',
    )).toMatch(/dissolved/i);
    expect(guestAnnualReportRefusal({ kind: 'dissolved' }, 'en')).not.toMatch(/https?:|\/reinstatement/);
  });

  it('sells the late current-year report when it is not filed', () => {
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: [2024, 2025],
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'sell', reportYear: 2026 });
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'A',
      filedYears: null,
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'sell', reportYear: 2026 });
  });

  it('sells nothing when the current report year is already filed', () => {
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'Active',
      filedYears: [2025, 2026],
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'already_filed', reportYear: 2026, nextOpenYear: 2027 });
    expect(guestAnnualReportRefusal(
      { kind: 'already_filed', reportYear: 2026, nextOpenYear: 2027 },
      'en',
    )).toBe('Nothing due until Jan 1, 2027.');
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: [2026, 2027],
      now: OCTOBER_15_NOON_ET,
    }).kind).toBe('already_filed');
  });

  it('marks a failed lookup so the customer can enter the company manually', async () => {
    expect(guestAnnualReportOffer({ lookupOk: false })).toEqual({ kind: 'lookup_failed' });
    expect(GUEST_LOOKUP_FAILED).toBe('lookup_failed');
    fetchDetail.mockRejectedValue(
      new Error('Entity lookup requires SUNBIZDAILY_API_KEY, or set LINK_ENTITY_ALLOW_SEED_LOOKUP=true.'),
    );
    const decision = await resolveGuestAnnualReportCharge({
      documentNumber: 'L12345678901',
      entityType: 'LLC',
      useOurRa: false,
      now: OCTOBER_15_NOON_ET,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.offer.kind).toBe('lookup_failed');
    expect(decision.quote.totalCents).toBe(63_775);
    expect(JSON.stringify(decision)).not.toMatch(/SUNBIZ|API_KEY|SEED_LOOKUP/);
  });

  it('reads filed years from a Sunbiz detail page and from the detail payload', () => {
    const html = readFileSync('scripts/sunbiz-scraper/fixtures/L15000063512.html', 'utf8');
    const years = parseFloridaAnnualReportYears(html);
    expect(years).toEqual([2024, 2025, 2026]);
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: years,
      now: OCTOBER_15_NOON_ET,
    }).kind).toBe('already_filed');
    expect(readAnnualReportFilings({
      annual_reports: [{ year: 2026, filed_date: '04/30/2026' }],
    })).toEqual([{ year: 2026, filed_date: '04/30/2026' }]);
    expect(annualReportYearsOf({})).toBeNull();
    expect(annualReportYearsOf({ annual_reports: [] })).toEqual([]);
  });

  it('keeps the English and Spanish messages free of dash characters and reinstatement links', () => {
    const form = readFileSync('components/marketing/GuestAnnualReportForm.tsx', 'utf8');
    expect(form).not.toMatch(/\/reinstatement|reinstatement page/i);
    expect(form).toContain("t('dissolvedBody')");
    expect(form).toContain("t('nothingDue'");
    expect(form).toContain('onManualContinue');
    for (const copy of [en.annualReportForm, es.annualReportForm]) {
      for (const key of [
        'dissolvedTitle',
        'dissolvedBody',
        'nothingDueTitle',
        'nothingDue',
        'lookupFailed',
        'manualTitle',
        'manualBody',
      ] as const) {
        expect(copy[key]).not.toMatch(DASH);
        expect(copy[key]).not.toMatch(/SUNBIZ|API_KEY|https?:/);
      }
    }
    expect(en.annualReportForm.nothingDue).toBe('Nothing due until Jan 1, {year}.');
    expect(es.annualReportForm.nothingDue).toBe('Nada pendiente hasta el 1 de enero de {year}.');
  });
});
