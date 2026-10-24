import { describe, expect, it } from 'vitest';
import { feeSplitLabel } from '@/components/marketing/fee-split';
import { tierIncludesCertificateFees, tierPriceParts } from '@/lib/pricing';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

function translate(catalog: Record<string, string>) {
  return (key: string, values: Record<string, string>) =>
    catalog[key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
}

describe('state fee labels', () => {
  it('keeps Essential at the filing fee and labels Popular and Premium certificate bundle', () => {
    expect(tierIncludesCertificateFees('BASIC')).toBe(false);
    expect(tierIncludesCertificateFees('STANDARD')).toBe(true);
    expect(tierIncludesCertificateFees('PREMIUM')).toBe(true);

    const t = translate(en.pricing);
    const basic = feeSplitLabel(t, tierPriceParts('BASIC', 'LLC', 'FL'), 'Florida', 'BASIC');
    const popular = feeSplitLabel(t, tierPriceParts('STANDARD', 'LLC', 'FL'), 'Florida', 'STANDARD');
    const premium = feeSplitLabel(t, tierPriceParts('PREMIUM', 'LLC', 'FL'), 'Florida', 'PREMIUM');

    expect(basic).toContain('$125');
    expect(basic).not.toMatch(/certified copy/i);
    expect(popular).toContain('$160');
    expect(popular).toMatch(/certified copy/i);
    expect(popular).toMatch(/certificate of status/i);
    expect(premium).toContain('$160');
    expect(tierPriceParts('BASIC', 'LLC', 'FL').totalCents).toBe(14_900);
    expect(tierPriceParts('STANDARD', 'LLC', 'FL').totalCents).toBe(27_900);
    expect(tierPriceParts('PREMIUM', 'LLC', 'FL').totalCents).toBe(44_900);

    const esLabel = feeSplitLabel(
      translate(es.pricing),
      tierPriceParts('STANDARD', 'LLC', 'FL'),
      'Florida',
      'STANDARD',
    );
    expect(esLabel).toContain('$160');
    expect(esLabel).toMatch(/copia certificada/i);
    expect(esLabel).toMatch(/certificado de estado/i);
  });
});
