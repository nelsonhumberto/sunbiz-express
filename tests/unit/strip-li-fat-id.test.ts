import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hrefWithoutLiFatId, LI_FAT_ID_STRIP_SCRIPT } from '@/lib/strip-li-fat-id';

describe('li_fat_id landing URL', () => {
  it('removes only li_fat_id and leaves utm params and gclid', () => {
    const href =
      'https://launchforma.com/es?utm_source=li&utm_medium=paid&gclid=abc&li_fat_id=xyz&utm_campaign=spring#plans';
    expect(hrefWithoutLiFatId(href)).toBe(
      'https://launchforma.com/es?utm_source=li&utm_medium=paid&gclid=abc&utm_campaign=spring#plans',
    );
    expect(hrefWithoutLiFatId('https://launchforma.com/?li_fat_id=1&li_fat_id=2&gclid=keep')).toBe(
      'https://launchforma.com/?gclid=keep',
    );
    const clean = 'https://launchforma.com/pricing?utm_source=google&gclid=1';
    expect(hrefWithoutLiFatId(clean)).toBe(clean);
    expect(hrefWithoutLiFatId('not a url')).toBe('not a url');
  });

  it('rewrites the address bar before PostHog and gtag initialize', () => {
    expect(LI_FAT_ID_STRIP_SCRIPT).toContain('history.replaceState');
    expect(LI_FAT_ID_STRIP_SCRIPT).toContain("searchParams.delete('li_fat_id')");
    expect(LI_FAT_ID_STRIP_SCRIPT).not.toContain('utm_');
    expect(LI_FAT_ID_STRIP_SCRIPT).not.toContain('gclid');

    const browser = readFileSync('lib/posthog-browser.ts', 'utf8');
    const strip = browser.indexOf('stripLiFatIdFromLocation()');
    const init = browser.indexOf('posthog.init(');
    expect(strip).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(strip);

    const ga = readFileSync('components/analytics/GoogleAnalytics.tsx', 'utf8');
    expect(ga.indexOf('LI_FAT_ID_STRIP_SCRIPT')).toBeLessThan(ga.indexOf("gtag('js'"));
    expect(ga).toContain("params.delete('li_fat_id')");

    const layout = readFileSync('app/layout.tsx', 'utf8');
    const early = layout.indexOf('id="strip-li-fat-id"');
    expect(early).toBeGreaterThan(-1);
    expect(early).toBeLessThan(layout.indexOf('id="openai-ads-pixel"'));
    expect(early).toBeLessThan(layout.indexOf('<PostHogProvider>'));
    expect(early).toBeLessThan(layout.indexOf('<GoogleAnalytics'));
    expect(layout).toContain('strategy="beforeInteractive"');
  });
});
