import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { annualReportDraftError, annualReportSaveRetry } from '@/lib/annual-report-draft';

const address = {
  street1: '1 Main St',
  city: 'Miami',
  state: 'FL',
  zip: '33101',
};

function draft(overrides: Record<string, unknown> = {}) {
  return {
    registeredAgentName: 'Ada Lovelace',
    registeredAgentAddress: address,
    useOurRa: false,
    principalAddress: address,
    mailingAddress: address,
    officers: [{ name: 'Ada Lovelace', title: 'MGR' }],
    signingOfficerName: 'Ada Lovelace',
    termsAccepted: true,
    ...overrides,
  };
}

describe('annual report draft', () => {
  it('accepts a complete draft', () => {
    expect(annualReportDraftError(draft())).toBeNull();
  });

  it('names the first missing field', () => {
    expect(annualReportDraftError(draft({ registeredAgentName: '  ' }))).toBe(
      'Enter the registered agent name.',
    );
    expect(annualReportDraftError(draft({ officers: [] }))).toBe('Add at least one officer.');
    expect(annualReportDraftError(draft({ principalAddress: { ...address, street1: '' } }))).toBe(
      'Enter a street address.',
    );
    expect(annualReportDraftError(draft({ termsAccepted: false }))).toBe(
      'Accept the terms to continue.',
    );
    expect(annualReportDraftError(draft({ signingOfficerName: 'Someone Else' }))).toBe(
      'Select an officer from the list to sign.',
    );
  });

  it('retries a charged payment without creating another row', () => {
    expect(annualReportSaveRetry({ paymentExists: false, reportFiled: false })).toBe('create');
    expect(annualReportSaveRetry({ paymentExists: true, reportFiled: false })).toBe('finish');
    expect(annualReportSaveRetry({ paymentExists: true, reportFiled: true })).toBe('done');
    expect(annualReportSaveRetry({ paymentExists: false, reportFiled: true })).toBe('blocked');
  });

  it('validates the dashboard form before confirming the card', () => {
    const form = readFileSync('components/dashboard/AnnualReportForm.tsx', 'utf8');
    const action = readFileSync('actions/annual-report.ts', 'utf8');
    expect(form.indexOf('annualReportDraftError')).toBeGreaterThan(-1);
    expect(form.indexOf('.confirm(')).toBeGreaterThan(form.indexOf('annualReportDraftError'));
    expect(form).toContain('chargedPaymentIntentId');
    expect(form).toContain('sessionStorage');
    expect(action).toContain("retry !== 'finish'");
    expect(action).toContain('ANNUAL_REPORT_UNSAVED');
  });
});
