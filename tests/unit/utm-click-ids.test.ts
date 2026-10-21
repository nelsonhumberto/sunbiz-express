import { describe, expect, it } from 'vitest';
import { mergeAttribution, parseUtmJson, utmFromSearchParams, utmToPrismaFields } from '@/lib/utm';

describe('click id attribution', () => {
  it('keeps gclid and li_fat_id in the cookie JSON', () => {
    const parsed = parseUtmJson(
      JSON.stringify({
        utm_source: 'linkedin',
        utm_medium: 'paid-social',
        gclid: 'abc',
        li_fat_id: 'fat-123',
        ignored: 'nope',
      }),
    );
    expect(parsed).toEqual({
      utm_source: 'linkedin',
      utm_medium: 'paid-social',
      gclid: 'abc',
      li_fat_id: 'fat-123',
    });
  });

  it('lets a later UTM set replace utm keys without dropping click ids', () => {
    const existing = parseUtmJson(
      JSON.stringify({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'en-fl-llc',
        gclid: 'keep-me',
        li_fat_id: 'keep-fat',
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
      li_fat_id: 'keep-fat',
    });
  });

  it('overlays a new click id onto an existing cookie', () => {
    const merged = mergeAttribution(
      { utm_source: 'linkedin', gclid: 'old' },
      { li_fat_id: 'new-fat' },
    );
    expect(merged).toEqual({
      utm_source: 'linkedin',
      gclid: 'old',
      li_fat_id: 'new-fat',
    });
  });

  it('maps click ids onto prisma fields', () => {
    expect(utmToPrismaFields({ gclid: 'g', li_fat_id: 'f', utm_source: 'chatgpt' })).toMatchObject({
      utmSource: 'chatgpt',
      gclid: 'g',
      liFatId: 'f',
    });
  });
});
