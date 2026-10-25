import { describe, expect, it } from 'vitest';
import { UTM_COOKIE, definedAttributionProps } from '@/lib/utm';

function cookie(value: Record<string, string>): string {
  return `${UTM_COOKIE}=${encodeURIComponent(JSON.stringify(value))}`;
}

describe('definedAttributionProps', () => {
  it('reads UTMs and click IDs from the URL', () => {
    expect(
      definedAttributionProps(
        'utm_source=test&utm_medium=cpc&utm_campaign=deadlines&utm_content=ad&utm_term=llc&gclid=g123',
        '',
      ),
    ).toEqual({
      utm_source: 'test',
      utm_medium: 'cpc',
      utm_campaign: 'deadlines',
      utm_content: 'ad',
      utm_term: 'llc',
      gclid: 'g123',
    });
  });

  it('keeps cookie attribution when the URL has no campaign params', () => {
    expect(
      definedAttributionProps('', cookie({ utm_source: 'newsletter', gclid: 'saved' })),
    ).toEqual({
      utm_source: 'newsletter',
      gclid: 'saved',
    });
  });

  it('lets a new URL UTM replace the cookie and keeps an older click id', () => {
    expect(
      definedAttributionProps(
        '?utm_source=test',
        cookie({ utm_source: 'old', utm_medium: 'email', gclid: 'saved' }),
      ),
    ).toEqual({
      utm_source: 'test',
      gclid: 'saved',
    });
  });
});
