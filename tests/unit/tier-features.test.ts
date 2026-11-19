import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildKnowledge } from '@/lib/assistant/knowledge';
import { buildLlmsTxt } from '@/lib/llms';
import { TIER_BY_SLUG, tierPackagePriceCents, type TierSlug } from '@/lib/pricing';
import { TIER_FEATURE_KEYS } from '@/lib/pricing-i18n';
import {
  OPERATING_AGREEMENT_CUSTOM_LABEL,
  OPERATING_AGREEMENT_LLC_SCOPED_LABEL,
  publicTierFeatureLabel,
  tierFeaturesForEntity,
  UNSCOPED_OA_FEATURE_KEY,
} from '@/lib/tier-features';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const BANKING_RESOLUTION = 'Banking resolution template';
const BANKING_RESOLUTION_ES = 'Plantilla de resolución bancaria';
const SCORP_FILING = 'S-Corp Election filing (Form 2553)';

function labels(tier: TierSlug, entityType: 'LLC' | 'CORP' | null, limit?: number): string[] {
  const features = tierFeaturesForEntity(TIER_BY_SLUG[tier].features, entityType);
  const visible = limit == null ? features : features.slice(0, limit);
  return visible.map((feature) => feature.label);
}

describe('plan-card features by entity', () => {
  it('keeps the custom Operating Agreement for LLC buyers and hides it for corporations', () => {
    expect(labels('STANDARD', 'LLC')).toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(labels('STANDARD', 'LLC', 6)).toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(labels('STANDARD', 'CORP')).not.toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(labels('PREMIUM', 'CORP').join(' ')).not.toContain('Operating Agreement');
    expect(TIER_FEATURE_KEYS[OPERATING_AGREEMENT_CUSTOM_LABEL]).toBe('feat_oa');
    expect(en.pricing.feat_oa).toBe('Operating Agreement (custom)');
    expect(es.pricing.feat_oa).toBe('Acuerdo Operativo (personalizado)');
  });

  it('scopes the public Operating Agreement line to LLCs in both catalogs', () => {
    expect(labels('STANDARD', null)).toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(publicTierFeatureLabel(OPERATING_AGREEMENT_CUSTOM_LABEL)).toBe(
      OPERATING_AGREEMENT_LLC_SCOPED_LABEL,
    );
    expect(UNSCOPED_OA_FEATURE_KEY).toBe('feat_oaLlcs');
    expect(en.pricing.feat_oaLlcs).toBe('Operating Agreement (LLCs)');
    expect(es.pricing.feat_oaLlcs).toBe('Acuerdo Operativo (LLCs)');
    expect(en.comparison.feat_oa).toBe('Operating Agreement (LLCs)');
    expect(es.comparison.feat_oa).toBe('Acuerdo Operativo (LLCs)');
    expect(en.pricing.feat_oaLlcs).not.toMatch(/[—–]/);
    expect(es.pricing.feat_oaLlcs).not.toMatch(/[—–]/);
    expect(es.pricing.feat_oaLlcs).not.toMatch(/\busted\b/i);

    const table = readFileSync('components/marketing/PricingTable.tsx', 'utf8');
    const picker = readFileSync('components/wizard/steps/Step3Tier.tsx', 'utf8');
    expect(table).toContain('UNSCOPED_OA_FEATURE_KEY');
    expect(table).toContain(`'Operating Agreement (custom)': UNSCOPED_OA_FEATURE_KEY`);
    expect(picker).toContain('tierFeaturesForEntity(tierDef.features, entityType)');
    expect(picker).toContain('.slice(0, 6)');
  });

  it('drops the banking resolution from Premium without changing package prices', () => {
    for (const tier of ['BASIC', 'STANDARD', 'PREMIUM'] as const) {
      for (const entity of ['LLC', 'CORP'] as const) {
        expect(labels(tier, entity).join('\n')).not.toContain(BANKING_RESOLUTION);
      }
    }
    expect(TIER_BY_SLUG.PREMIUM.description).toBe(en.pricing.tier_PREMIUM_desc);
    expect(TIER_BY_SLUG.PREMIUM.description.toLowerCase()).not.toContain('banking');
    expect(tierPackagePriceCents('BASIC', 'LLC', 'FL')).toBe(19_900);
    expect(tierPackagePriceCents('STANDARD', 'LLC', 'FL')).toBe(34_900);
    expect(tierPackagePriceCents('PREMIUM', 'LLC', 'FL')).toBe(54_900);
    expect(tierPackagePriceCents('BASIC', 'CORP', 'FL')).toBe(14_400);
    expect(tierPackagePriceCents('STANDARD', 'CORP', 'FL')).toBe(27_650);
    expect(tierPackagePriceCents('PREMIUM', 'CORP', 'FL')).toBe(47_650);

    const listedIn = [
      'lib/pricing.ts',
      'lib/pricing-i18n.ts',
      'components/marketing/PricingTable.tsx',
      'components/wizard/steps/Step3Tier.tsx',
      'messages/en.json',
      'messages/es.json',
    ];
    for (const file of listedIn) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain(BANKING_RESOLUTION);
      expect(source, file).not.toContain(BANKING_RESOLUTION_ES);
      expect(source, file).not.toContain('feat_banking');
    }
    expect(en.pricing).not.toHaveProperty('feat_banking');
    expect(es.pricing).not.toHaveProperty('feat_banking');
  });

  it('keeps the S-Corp election line on Premium for corporations', () => {
    expect(labels('PREMIUM', 'CORP', 6)).toContain(SCORP_FILING);
    expect(labels('PREMIUM', 'LLC', 6)).toContain(SCORP_FILING);
    expect(en.pricing.feat_scorpFiling).toBe('S-Corp election filing');
    expect(es.pricing.feat_scorpFiling).toBe('Presentación de la elección S-Corp');
  });

  it('omits the Operating Agreement and the banking resolution from public and corp copy', () => {
    const llms = buildLlmsTxt();
    expect(llms).toContain(OPERATING_AGREEMENT_LLC_SCOPED_LABEL);
    expect(llms).not.toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(llms).not.toContain(BANKING_RESOLUTION);

    const llc = buildKnowledge({ stateCode: 'FL', entityType: 'LLC', locale: 'en' });
    const corp = buildKnowledge({ stateCode: 'FL', entityType: 'CORP', locale: 'en' });
    expect(llc).toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(corp).not.toContain(OPERATING_AGREEMENT_CUSTOM_LABEL);
    expect(llc).not.toContain(BANKING_RESOLUTION);
    expect(corp).not.toContain(BANKING_RESOLUTION);
    expect(corp).toContain(SCORP_FILING);
  });
});
