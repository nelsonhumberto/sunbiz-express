import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADD_ON_BY_SLUG,
  addOnPriceCents,
  computeCost,
  snapshotAddOnPriceCents,
  type AddOnSlug,
} from '@/lib/pricing';

const STALE_CATALOG = {
  ein: 4_900,
  operating_agreement_single: 4_900,
  operating_agreement_multi: 9_900,
  domain_com: 1_200,
} as const;

const PRICED: AddOnSlug[] = [
  'ein',
  'operating_agreement_single',
  'operating_agreement_multi',
  'domain_com',
];

describe('snapshotAddOnPriceCents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the lib/pricing price for ein, both operating agreements, and domain_com', () => {
    expect(snapshotAddOnPriceCents({ slug: 'ein', dbPriceCents: STALE_CATALOG.ein })).toBe(7_900);
    expect(
      snapshotAddOnPriceCents({
        slug: 'operating_agreement_single',
        dbPriceCents: STALE_CATALOG.operating_agreement_single,
      }),
    ).toBe(8_900);
    expect(
      snapshotAddOnPriceCents({
        slug: 'operating_agreement_multi',
        dbPriceCents: STALE_CATALOG.operating_agreement_multi,
      }),
    ).toBe(14_900);
    expect(
      snapshotAddOnPriceCents({ slug: 'domain_com', dbPriceCents: STALE_CATALOG.domain_com }),
    ).toBe(1_900);

    for (const slug of PRICED) {
      const snapshot = snapshotAddOnPriceCents({
        slug,
        dbPriceCents: STALE_CATALOG[slug],
        entityType: 'LLC',
        state: 'FL',
      });
      expect(snapshot).toBe(addOnPriceCents(slug, 'LLC', 'FL'));
      expect(snapshot).toBe(ADD_ON_BY_SLUG[slug].serviceMarginCents);
      expect(snapshot).not.toBe(STALE_CATALOG[slug]);
    }
  });

  it('matches the add-on amount computeCost charges on a Basic LLC', () => {
    const baseline = computeCost({
      entityType: 'LLC',
      tier: 'BASIC',
      addOnSlugs: [],
      state: 'FL',
    });

    for (const slug of [
      'operating_agreement_single',
      'operating_agreement_multi',
      'domain_com',
    ] as const) {
      const snapshot = snapshotAddOnPriceCents({
        slug,
        dbPriceCents: STALE_CATALOG[slug],
        entityType: 'LLC',
        state: 'FL',
      });
      const charged = computeCost({
        entityType: 'LLC',
        tier: 'BASIC',
        addOnSlugs: [slug],
        state: 'FL',
      });
      expect(charged.lines.find((line) => line.addOnSlug === slug)?.cents).toBe(snapshot);
      expect(charged.totalCents - baseline.totalCents).toBe(snapshot);
    }

    // EIN is sold from the dashboard. computeCost skips it in formation
    // checkout, and the dashboard charge is the same lib/pricing price.
    const einSnapshot = snapshotAddOnPriceCents({
      slug: 'ein',
      dbPriceCents: STALE_CATALOG.ein,
      entityType: 'LLC',
      state: 'FL',
    });
    const withEin = computeCost({
      entityType: 'LLC',
      tier: 'BASIC',
      addOnSlugs: ['ein'],
      state: 'FL',
    });
    expect(withEin.lines.find((line) => line.addOnSlug === 'ein')).toBeUndefined();
    expect(withEin.totalCents).toBe(baseline.totalCents);
    expect(einSnapshot).toBe(addOnPriceCents('ein', 'LLC', 'FL'));
    expect(einSnapshot).toBe(ADD_ON_BY_SLUG.ein.serviceMarginCents);
  });

  it('falls back to the catalog price and warns when the slug is not in lib/pricing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snapshot = snapshotAddOnPriceCents({
      slug: 'not_in_pricing',
      dbPriceCents: 4_900,
      entityType: 'CORP',
      state: 'WY',
    });
    expect(snapshot).toBe(4_900);
    expect(warn).toHaveBeenCalled();
    const [prefix, message, context] = warn.mock.calls[0] ?? [];
    expect(String(prefix)).toContain('pricing');
    expect(String(message)).toContain('not in lib/pricing');
    expect(context).toMatchObject({ slug: 'not_in_pricing', dbPriceCents: 4_900 });
  });
});
