import { describe, expect, it } from 'vitest';
import { buildTrackedUrl } from '@/lib/utm-links';

const base = {
  state: 'FL',
  tier: 'STANDARD',
  content: 'creative-1',
  term: 'keyword',
};

describe('utm builder presets', () => {
  it('builds a LinkedIn business-services URL without state or package', () => {
    expect(
      buildTrackedUrl({
        ...base,
        path: '/business-services',
        lang: 'en',
        source: 'linkedin',
        medium: 'paid-social',
        campaign: 'en-business-services',
      }),
    ).toBe(
      'https://launchforma.com/business-services?utm_source=linkedin&utm_medium=paid-social&utm_campaign=en-business-services&utm_content=creative-1&utm_term=keyword',
    );
  });

  it('does not add lang=es when the path is already Spanish', () => {
    expect(
      buildTrackedUrl({
        ...base,
        path: '/es/business-services',
        lang: 'es',
        source: 'chatgpt',
        medium: 'cpc',
        campaign: 'es-business-services',
        content: '',
        term: '',
      }),
    ).toBe(
      'https://launchforma.com/es/business-services?utm_source=chatgpt&utm_medium=cpc&utm_campaign=es-business-services',
    );
  });

  it('still adds lang=es on the English path when Spanish is selected', () => {
    expect(
      buildTrackedUrl({
        ...base,
        path: '/business-services',
        lang: 'es',
        source: 'chatgpt',
        medium: 'cpc',
        campaign: 'es-business-services',
        content: '',
        term: '',
      }),
    ).toBe(
      'https://launchforma.com/business-services?lang=es&utm_source=chatgpt&utm_medium=cpc&utm_campaign=es-business-services',
    );
  });
});
