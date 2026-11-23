import { describe, expect, it } from 'vitest';
import { classifyEinPathway } from '@/lib/ein';
import { quoteDraftFiling } from '@/lib/filing-totals';
import { addOnPriceCents, computeCost, tierPackagePriceCents, type AddOnSlug } from '@/lib/pricing';
import {
  billableAddOnSlugs,
  hasShareholderWithoutTaxId,
  sCorpAddOnCardOffered,
  sCorpOrderOwners,
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

    const notYetCollected = shareholderTaxIdsFromOptional({
      entityType: 'LLC',
      memberTaxInfo: [{ taxIdType: 'SSN' }, { taxIdType: null }],
      memberCount: 2,
    });
    expect(hasShareholderWithoutTaxId(notYetCollected)).toBe(false);
    expect(
      shouldCollectSCorpConsent({
        taxElection: null,
        addOnSlugs: ['s_corp_election'],
        shareholders: notYetCollected,
      }),
    ).toBe(true);
    expect(
      shouldGenerateForm2553({
        taxElection: null,
        addOnSlugs: ['s_corp_election'],
        shareholders: notYetCollected,
      }),
    ).toBe(true);
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

  it('drops the S-Corp add-on and its price when an owner has no SSN or ITIN', () => {
    const shareholders = [{ taxIdType: 'SSN' }, { taxIdType: 'NONE' }];
    expect(billableAddOnSlugs(['s_corp_election', 'registered_agent'], shareholders, 'S_CORP')).toEqual([
      'registered_agent',
    ]);
    const quote = quoteDraftFiling({
      entityType: 'LLC',
      serviceTier: 'BASIC',
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({
        memberTaxInfo: shareholders,
      }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(quote.addOnsTotalCents).toBe(0);
    expect(quote.totalCents).toBe(tierPackagePriceCents('BASIC', 'LLC', 'FL'));
  });

  it('keeps and charges the S-Corp add-on when an S-Corp election has not collected tax ids yet', () => {
    const addonLlc = addOnPriceCents('s_corp_election', 'LLC', 'FL');
    const addonCorp = addOnPriceCents('s_corp_election', 'CORP', 'FL');
    const llcOwners = [{ taxIdType: null }, { taxIdType: null }];
    expect(sCorpAddOnCardOffered({ taxElection: 'S_CORP', shareholders: llcOwners })).toBe(true);
    const llc = quoteDraftFiling({
      entityType: 'LLC',
      serviceTier: 'BASIC',
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({ memberTaxInfo: llcOwners }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(hasShareholderWithoutTaxId([{ taxIdType: null }, { taxIdType: undefined }])).toBe(false);
    expect(llc.addOnsTotalCents).toBe(addonLlc);
    expect(llc.totalCents).toBe(tierPackagePriceCents('BASIC', 'LLC', 'FL') + addonLlc);

    const corpOwners = [{ taxIdType: null }, { name: 'Ada' }];
    expect(sCorpAddOnCardOffered({ taxElection: 'S_CORP', shareholders: corpOwners })).toBe(true);
    const corp = quoteDraftFiling({
      entityType: 'CORP',
      serviceTier: 'BASIC',
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({
        shareStructure: { shareholders: corpOwners },
      }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(corp.addOnsTotalCents).toBe(addonCorp);
    expect(corp.totalCents).toBe(tierPackagePriceCents('BASIC', 'CORP', 'FL') + addonCorp);
  });

  it('does not offer or charge the S-Corp add-on when the filing did not elect S-Corp', () => {
    const owners = [{ taxIdType: 'SSN' }];
    expect(sCorpAddOnCardOffered({ taxElection: null, shareholders: owners })).toBe(false);
    expect(billableAddOnSlugs(['s_corp_election'], owners, null)).toEqual([]);
    const quote = quoteDraftFiling({
      entityType: 'CORP',
      serviceTier: 'STANDARD',
      state: 'FL',
      taxElection: null,
      optionalDetails: JSON.stringify({
        shareStructure: { shareholders: [{ taxIdType: null }] },
      }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(quote.addOnsTotalCents).toBe(0);
    expect(quote.totalCents).toBe(tierPackagePriceCents('STANDARD', 'CORP', 'FL'));
  });

  it('hides and does not charge the S-Corp add-on for NONE or a foreign party', () => {
    const none = [{ taxIdType: 'NONE' }];
    const foreign = [{ taxIdType: 'SSN', responsiblePartyType: 'foreign' as const }];
    expect(sCorpAddOnCardOffered({ taxElection: 'S_CORP', shareholders: none })).toBe(false);
    expect(sCorpAddOnCardOffered({ taxElection: 'S_CORP', shareholders: foreign })).toBe(false);
    expect(billableAddOnSlugs(['s_corp_election'], none, 'S_CORP')).toEqual([]);
    expect(billableAddOnSlugs(['s_corp_election'], foreign, 'S_CORP')).toEqual([]);
    const dropped = quoteDraftFiling({
      entityType: 'CORP',
      serviceTier: 'BASIC',
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({
        shareStructure: { shareholders: [{ taxIdType: 'NONE' }] },
      }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(dropped.addOnsTotalCents).toBe(0);
    expect(dropped.totalCents).toBe(tierPackagePriceCents('BASIC', 'CORP', 'FL'));
    const foreignQuote = quoteDraftFiling({
      entityType: 'LLC',
      serviceTier: 'BASIC',
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({
        memberTaxInfo: [{ taxIdType: 'SSN', responsiblePartyType: 'foreign' }],
      }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(foreignQuote.addOnsTotalCents).toBe(0);
    expect(foreignQuote.totalCents).toBe(tierPackagePriceCents('BASIC', 'LLC', 'FL'));
  });

  it('charges the same amount on the pay page and the PaymentIntent when the EIN party is foreign', () => {
    const filing = {
      entityType: 'LLC' as const,
      serviceTier: 'BASIC' as const,
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({
        memberTaxInfo: [{ taxIdType: 'SSN' }],
      }),
      einApplication: {
        responsiblePartyType: 'foreign',
        taxIdType: null,
        status: 'manual_foreign',
      },
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    };
    const owners = sCorpOrderOwners({
      entityType: filing.entityType,
      optionalDetails: filing.optionalDetails,
      ein: filing.einApplication,
    });
    const slugs = billableAddOnSlugs(
      filing.filingAdditionalServices.map((row) => row.service.serviceSlug as AddOnSlug),
      owners,
      filing.taxElection,
    );
    const displayed = computeCost({
      entityType: filing.entityType,
      tier: filing.serviceTier,
      addOnSlugs: slugs,
      state: 'FL',
    }).totalCents;
    const charged = quoteDraftFiling(filing).totalCents;
    expect(sCorpAddOnCardOffered({ taxElection: filing.taxElection, shareholders: owners })).toBe(
      false,
    );
    expect(displayed).toBe(charged);
    expect(charged).toBe(tierPackagePriceCents('BASIC', 'LLC', 'FL'));
  });

  it('keeps and charges the S-Corp add-on when every owner has an SSN', () => {
    const shareholders = [{ taxIdType: 'SSN' }, { taxIdType: 'SSN' }];
    expect(sCorpAddOnCardOffered({ taxElection: 'S_CORP', shareholders })).toBe(true);
    expect(billableAddOnSlugs(['s_corp_election'], shareholders, 'S_CORP')).toEqual([
      's_corp_election',
    ]);
    const addon = addOnPriceCents('s_corp_election', 'LLC', 'FL');
    const quote = quoteDraftFiling({
      entityType: 'LLC',
      serviceTier: 'BASIC',
      state: 'FL',
      taxElection: 'S_CORP',
      optionalDetails: JSON.stringify({
        memberTaxInfo: shareholders,
      }),
      filingAdditionalServices: [{ service: { serviceSlug: 's_corp_election' } }],
    });
    expect(quote.addOnsTotalCents).toBe(addon);
    expect(quote.totalCents).toBe(tierPackagePriceCents('BASIC', 'LLC', 'FL') + addon);
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
