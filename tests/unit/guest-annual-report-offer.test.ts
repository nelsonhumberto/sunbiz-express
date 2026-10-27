import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';
import es from '../../messages/es.json';
import {
  mapSunbizDailyDetailBody,
  parseFloridaAnnualReportYears,
  parseFloridaDetailFacts,
  readAnnualReportFilings,
  readEventFiledYears,
  readFloridaFileDate,
} from '@/lib/sunbiz';
import { resolveGuestAnnualReportCharge } from '@/lib/guest-annual-report-charge';
import {
  GUEST_LOOKUP_FAILED,
  annualReportYearsOf,
  guestAnnualReportOffer,
  guestAnnualReportRefusal,
  pricedFloridaEntityType,
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

  it('sells the late current-year report only when it is known to be unfiled', () => {
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: [2024, 2025],
      fileDate: '04/10/2015',
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'sell', reportYear: 2026 });
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'A',
      filedYears: [],
      fileDate: '2025-06-01',
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'sell', reportYear: 2026 });
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'A',
      filedYears: null,
      fileDate: '2015-04-10',
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'unconfirmed' });
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: [],
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'unconfirmed' });
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

  it('does not sell when the lookup fails or the filing year is still unknown', async () => {
    expect(guestAnnualReportOffer({ lookupOk: false })).toEqual({ kind: 'unconfirmed' });
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
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe('annual_report_unconfirmed');
    expect(decision.offer.kind).toBe('unconfirmed');
    expect(decision.error).toBe("We couldn't confirm this company's annual report status online.");
    expect(JSON.stringify(decision)).not.toMatch(/SUNBIZ|API_KEY|SEED_LOOKUP/);
  });

  it('refuses a current-year formation and a current-year annual report event', () => {
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: null,
      fileDate: '2026-01-01',
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'not_yet_due', reportYear: 2026, nextOpenYear: 2027 });
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: null,
      eventFiledYears: [2026],
      fileDate: '04/10/2015',
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'already_filed', reportYear: 2026, nextOpenYear: 2027 });
    expect(guestAnnualReportOffer({
      lookupOk: true,
      status: 'ACTIVE',
      filedYears: null,
      eventFiledYears: [2025],
      fileDate: '04/10/2015',
      now: OCTOBER_15_NOON_ET,
    })).toEqual({ kind: 'unconfirmed' });
    expect(guestAnnualReportRefusal(
      { kind: 'not_yet_due', reportYear: 2026, nextOpenYear: 2027 },
      'es',
    )).toBe('Nada pendiente hasta el 1 de enero de 2027.');
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
    const facts = parseFloridaDetailFacts(html);
    expect(facts.years).toEqual([2024, 2025, 2026]);
    expect(facts.hasAnnualReportTable).toBe(true);
    expect(facts.fileDate).toBe('04/10/2015');
    expect(facts.lastEvent).toBe('REINSTATEMENT');
    expect(facts.lastEventDate).toBe('10/08/2020');
    expect(readAnnualReportFilings({
      annual_reports: [{ year: 2026, filed_date: '04/30/2026' }],
    })).toEqual([{ year: 2026, filed_date: '04/30/2026' }]);
    expect(readAnnualReportFilings({})).toBeUndefined();
    expect(readAnnualReportFilings({ annual_reports: [] })).toEqual([]);
    expect(readAnnualReportFilings({
      cordata: { report_year_1: 2024, report_year_2: 2025, report_year_3: 2026 },
    })?.map((row) => row.year)).toEqual([2024, 2025, 2026]);
    expect(readAnnualReportFilings({
      report_year_1: null,
      report_year_2: '',
      report_year_3: null,
    })).toEqual([]);
    expect(readEventFiledYears({
      last_event: 'ANNUAL REPORT',
      last_event_file_date: '04/30/2026',
    })).toEqual([2026]);
    expect(readEventFiledYears({ last_event: 'REINSTATEMENT', event_date_filed: '10/08/2020' })).toEqual([]);
    expect(readFloridaFileDate({ cordata: { file_date: '2026-10-19' } })).toBe('2026-10-19');
    expect(annualReportYearsOf({})).toBeNull();
    expect(annualReportYearsOf({ annual_reports: [] })).toEqual([]);
    const filed = mapSunbizDailyDetailBody({
      corporation_number: 'L15000021030',
      corporation_name: 'SOUTHERN HOLDINGS 9 LLC',
      status: 'ACTIVE',
      filing_type: 'FLAL',
      filing_type_display: 'Florida Limited Liability Company',
      file_date: '2015-04-10',
      cordata: { report_year_1: 2026, ar_date_1: '04/30/2026' },
    });
    expect(annualReportYearsOf(filed)).toEqual([2026]);
    const unknown = mapSunbizDailyDetailBody({
      corporation_number: 'L25000509630',
      corporation_name: 'Open LLC',
      status: 'A',
      filing_type: 'FLAL',
      filing_type_display: 'Florida Limited Liability Company',
      file_date: '2025-03-01',
    });
    expect(unknown.annual_reports).toBeUndefined();
    expect(unknown.file_date).toBe('2025-03-01');
  });

  it('prices a quote from the document prefix and refuses an unpriced type', () => {
    expect(pricedFloridaEntityType('P26QA000001', {})).toBe('CORP');
    expect(pricedFloridaEntityType('N26000000001', {})).toBe('CORP');
    expect(pricedFloridaEntityType('L25000509630', { filing_type_display: 'Florida Profit Corporation' })).toBe('LLC');
    expect(pricedFloridaEntityType('X25000000001', {})).toBeNull();
    expect(pricedFloridaEntityType('X25000000001', { filing_type: 'FLAL' })).toBe('LLC');
  });

  it('keeps the English and Spanish messages free of dash characters and reinstatement links', () => {
    const form = readFileSync('components/marketing/GuestAnnualReportForm.tsx', 'utf8');
    expect(form).not.toMatch(/\/reinstatement|reinstatement page/i);
    expect(form).toContain("t('dissolvedBody')");
    expect(form).toContain("t('nothingDue'");
    expect(form).toContain("t('unconfirmedBody')");
    expect(form).toContain('checklist-signup-heading');
    expect(form).toContain('unconfirmedContact');
    expect(form).toContain('activeStatusLabel');
    expect(form).not.toContain('onManualContinue');
    expect(form).not.toMatch(/status:\s*'ACTIVE'/);
    const page = readFileSync('app/(marketing)/file-annual-report/page.tsx', 'utf8');
    expect(page).toContain('overflow-x-auto');
    expect(page).toContain('min-w-[36rem]');
    expect(page.indexOf('</table>')).toBeLessThan(page.indexOf('footnote'));
    for (const copy of [en.annualReportForm, es.annualReportForm]) {
      for (const key of [
        'dissolvedTitle',
        'dissolvedBody',
        'nothingDueTitle',
        'nothingDue',
        'nothingDueYetTitle',
        'unconfirmedTitle',
        'unconfirmedBody',
        'unconfirmedContact',
        'unconfirmedChecklist',
        'lookupFailed',
        'manualTitle',
        'manualBody',
      ] as const) {
        expect(copy[key]).not.toMatch(DASH);
        expect(copy[key]).not.toMatch(/SUNBIZ|API_KEY|https?:/);
        expect(copy[key]).not.toMatch(/refund/i);
      }
    }
    expect(en.annualReportForm.nothingDue).toBe('Nothing due until Jan 1, {year}.');
    expect(es.annualReportForm.nothingDue).toBe('Nada pendiente hasta el 1 de enero de {year}.');
    expect(en.annualReportForm.unconfirmedBody).toBe(
      "We couldn't confirm this company's annual report status online.",
    );
    expect(es.annualReportForm.unconfirmedBody).toBe(
      'No pudimos confirmar en línea el estado del reporte anual de esta compañía.',
    );
    expect(es.annualReportForm.dissolvedBody).toContain('restablecerse');
    expect(es.annualReportForm.dissolvedBody).toContain('puedas');
    expect(es.annualReportForm.dissolvedBody).not.toContain('reinstalación');
    expect(guestAnnualReportRefusal({ kind: 'dissolved' }, 'es')).toContain('restablecerse');
    expect(guestAnnualReportRefusal({ kind: 'dissolved' }, 'es')).not.toContain('reinstalación');
  });
});
