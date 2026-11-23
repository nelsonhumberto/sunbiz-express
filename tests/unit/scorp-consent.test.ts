import { describe, expect, it } from 'vitest';
import { classifyEinPathway } from '@/lib/ein';
import {
  hasShareholderWithoutTaxId,
  shareholderTaxIdsFromOptional,
  shouldCollectSCorpConsent,
  shouldGenerateForm2553,
} from '@/lib/scorp-consent';

describe('S-Corp consent and Form 2553 when an owner has no SSN or ITIN', () => {
  it('shows consent and generates Form 2553 when every owner has an SSN and S-Corp is elected', () => {
    const shareholders = [{ taxIdType: 'SSN' }, { taxIdType: 'SSN' }];
    expect(hasShareholderWithoutTaxId(shareholders)).toBe(false);
    expect(
      shouldCollectSCorpConsent({
        taxElection: 'S_CORP',
        addOnSlugs: [],
        shareholders,
      }),
    ).toBe(true);
    expect(
      shouldGenerateForm2553({
        taxElection: 'S_CORP',
        addOnSlugs: [],
        shareholders,
      }),
    ).toBe(true);
  });

  it('treats an ITIN like an SSN for consent and Form 2553', () => {
    const shareholders = [{ taxIdType: 'SSN' }, { taxIdType: 'ITIN' }];
    expect(hasShareholderWithoutTaxId(shareholders)).toBe(false);
    expect(
      shouldCollectSCorpConsent({
        taxElection: 'S_CORP',
        addOnSlugs: ['s_corp_election'],
        shareholders,
      }),
    ).toBe(true);
    expect(
      shouldGenerateForm2553({
        taxElection: 'S_CORP',
        addOnSlugs: ['s_corp_election'],
        shareholders,
      }),
    ).toBe(true);
  });

  it('skips consent and Form 2553 when any owner has no SSN or ITIN, even if S-Corp was selected', () => {
    const shareholders = [{ taxIdType: 'SSN' }, { taxIdType: 'NONE' }];
    expect(hasShareholderWithoutTaxId(shareholders)).toBe(true);
    expect(
      classifyEinPathway({ responsiblePartyType: 'us', taxIdType: null }),
    ).toBe('manual_foreign');
    expect(
      shouldCollectSCorpConsent({
        taxElection: 'S_CORP',
        addOnSlugs: ['s_corp_election'],
        serviceTier: 'PREMIUM',
        shareholders,
      }),
    ).toBe(false);
    expect(
      shouldGenerateForm2553({
        taxElection: 'S_CORP',
        addOnSlugs: ['s_corp_election'],
        shareholders,
      }),
    ).toBe(false);

    const fromStored = shareholderTaxIdsFromOptional({
      entityType: 'LLC',
      memberTaxInfo: [{ taxIdType: 'SSN' }, { taxIdType: null }],
      memberCount: 2,
    });
    expect(hasShareholderWithoutTaxId(fromStored)).toBe(true);
    expect(
      shouldGenerateForm2553({
        taxElection: 'S_CORP',
        addOnSlugs: [],
        shareholders: fromStored,
      }),
    ).toBe(false);
  });

  it('treats a foreign responsible party as the manual_foreign EIN pathway', () => {
    const shareholders = [{ taxIdType: 'SSN', responsiblePartyType: 'foreign' as const }];
    expect(hasShareholderWithoutTaxId(shareholders)).toBe(true);
    expect(
      classifyEinPathway({ responsiblePartyType: 'foreign', taxIdType: 'SSN' }),
    ).toBe('manual_foreign');
    expect(
      shouldGenerateForm2553({
        taxElection: 'S_CORP',
        addOnSlugs: [],
        shareholders,
      }),
    ).toBe(false);
  });

  it('leaves a filing that did not elect S-Corp unchanged', () => {
    const withSsn = [{ taxIdType: 'SSN' }];
    const without = [{ taxIdType: 'NONE' }];

    expect(
      shouldCollectSCorpConsent({
        taxElection: null,
        addOnSlugs: [],
        serviceTier: 'BASIC',
        shareholders: withSsn,
      }),
    ).toBe(false);
    expect(
      shouldGenerateForm2553({
        taxElection: null,
        addOnSlugs: [],
        shareholders: withSsn,
      }),
    ).toBe(false);
    expect(
      shouldCollectSCorpConsent({
        taxElection: null,
        addOnSlugs: [],
        serviceTier: 'BASIC',
        shareholders: without,
      }),
    ).toBe(false);
    expect(
      shouldGenerateForm2553({
        taxElection: null,
        addOnSlugs: [],
        shareholders: without,
      }),
    ).toBe(false);

    // Premium still collects consent when every owner has an SSN, and still
    // does not generate Form 2553 unless the election or add-on was chosen.
    expect(
      shouldCollectSCorpConsent({
        taxElection: null,
        addOnSlugs: [],
        serviceTier: 'PREMIUM',
        shareholders: withSsn,
      }),
    ).toBe(true);
    expect(
      shouldGenerateForm2553({
        taxElection: null,
        addOnSlugs: [],
        shareholders: withSsn,
      }),
    ).toBe(false);
  });

  it('still generates Form 2553 for a trust or estate EIN', () => {
    const shareholders = [{ taxIdType: 'EIN' }];
    expect(hasShareholderWithoutTaxId(shareholders)).toBe(false);
    expect(
      shouldCollectSCorpConsent({
        taxElection: 'S_CORP',
        addOnSlugs: [],
        shareholders,
      }),
    ).toBe(true);
    expect(
      shouldGenerateForm2553({
        taxElection: 'S_CORP',
        addOnSlugs: [],
        shareholders,
      }),
    ).toBe(true);
  });
});
