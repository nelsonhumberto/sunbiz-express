import { describe, expect, it } from 'vitest';
import { filingTotalsChanged, quoteDraftFiling } from '@/lib/filing-totals';
import { addOnPriceCents, tierPackagePriceCents } from '@/lib/pricing';

/** Popular Florida LLC price stored on drafts created before the catalog change. */
const STALE_POPULAR_CENTS = 27_900;

describe('stale draft totals', () => {
  it('quotes the current Popular price and ignores a stored $279 total', () => {
    const draft = {
      entityType: 'LLC',
      serviceTier: 'STANDARD',
      state: 'FL',
      optionalDetails: null,
      filingAdditionalServices: [],
      totalCents: STALE_POPULAR_CENTS,
    };
    const quote = quoteDraftFiling(draft);

    expect(quote.totalCents).toBe(tierPackagePriceCents('STANDARD', 'LLC', 'FL'));
    expect(quote.totalCents).toBe(34_900);
    expect(quote.totalCents).not.toBe(STALE_POPULAR_CENTS);
    expect(
      filingTotalsChanged(
        {
          totalCents: STALE_POPULAR_CENTS,
          stateFeeCents: quote.stateFeeCents,
          serviceFeeCents: quote.serviceFeeCents,
          addOnsTotalCents: 0,
        },
        quote,
      ),
    ).toBe(true);
  });

  it('adds a selected operating agreement on top of Essential', () => {
    const quote = quoteDraftFiling({
      entityType: 'LLC',
      serviceTier: 'BASIC',
      state: 'FL',
      optionalDetails: null,
      filingAdditionalServices: [{ service: { serviceSlug: 'operating_agreement_single' } }],
    });
    const expected =
      tierPackagePriceCents('BASIC', 'LLC', 'FL') +
      addOnPriceCents('operating_agreement_single', 'LLC', 'FL');
    expect(quote.totalCents).toBe(expected);
    expect(quote.addOnsTotalCents).toBe(addOnPriceCents('operating_agreement_single', 'LLC', 'FL'));
  });
});
