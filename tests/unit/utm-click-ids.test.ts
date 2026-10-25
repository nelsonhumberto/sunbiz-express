import { describe, expect, it } from 'vitest';
import { mergeAttribution, parseUtmJson, utmFromSearchParams, utmToPrismaFields } from '@/lib/utm';

describe('click id attribution', () => {
  it('keeps gclid in the cookie JSON and drops unknown keys', () => {
    const parsed = parseUtmJson(
      JSON.stringify({
        utm_source: 'google',
        utm_medium: 'cpc',
        gclid: 'abc',
        ignored: 'nope',
      }),
    );
    expect(parsed).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      gclid: 'abc',
    });
  });

  it('lets a later UTM set replace utm keys without dropping gclid', () => {
    const existing = parseUtmJson(
      JSON.stringify({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'en-fl-llc',
        gclid: 'keep-me',
      }),
    );
    const incoming = utmFromSearchParams(
      new URLSearchParams('utm_source=chatgpt&utm_medium=cpc&utm_campaign=es-business-services'),
    );
    expect(mergeAttribution(existing, incoming!)).toEqual({
      utm_source: 'chatgpt',
      utm_medium: 'cpc',
      utm_campaign: 'es-business-services',
      gclid: 'keep-me',
    });
  });

  it('overlays a new gclid onto an existing cookie', () => {
    const merged = mergeAttribution({ utm_source: 'google', gclid: 'old' }, { gclid: 'new-click' });
    expect(merged).toEqual({
      utm_source: 'google',
      gclid: 'new-click',
    });
  });

  it('maps gclid onto prisma fields', () => {
    expect(utmToPrismaFields({ gclid: 'g', utm_source: 'chatgpt' })).toEqual({
      utmSource: 'chatgpt',
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      gclid: 'g',
    });
  });
});
