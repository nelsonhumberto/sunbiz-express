import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENAI_PIXEL_ID_FALLBACK } from '@/lib/tracking-ids';
import { openAiPixelBootstrap } from '@/lib/openai-pixel';

function runBootstrap(cookie: string, extra: Record<string, unknown> = {}) {
  const created: Array<{ src: string }> = [];
  const context: Record<string, unknown> = {
    navigator: { globalPrivacyControl: false },
    document: {
      cookie,
      createElement: () => {
        const el = { src: '' };
        created.push(el);
        return el;
      },
      getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
    },
    ...extra,
  };
  context.window = context;
  vm.runInNewContext(openAiPixelBootstrap(OPENAI_PIXEL_ID_FALLBACK), context);
  return { created, oaiq: context.oaiq as ((...args: unknown[]) => void) | undefined };
}

describe('OpenAI Ads pixel bootstrap', () => {
  it('loads the production pixel and initializes it', () => {
    expect(OPENAI_PIXEL_ID_FALLBACK).toBe('HLuEiBiKzL32aoTo43Z5BV');

    const snippet = openAiPixelBootstrap(OPENAI_PIXEL_ID_FALLBACK);
    expect(snippet).toContain('https://bzrcdn.openai.com/sdk/oaiq.min.js');
    expect(snippet).toContain('oaiq("init", { pixelId: "HLuEiBiKzL32aoTo43Z5BV" })');
    expect(snippet).not.toContain('lead_created');
    expect(snippet.indexOf('lf_ads_consent=all')).toBeLessThan(snippet.indexOf('js.src = u'));
  });

  it('does not request the SDK before Accept, on Essential only, on opt-out, or for a tester', () => {
    for (const cookie of ['', 'lf_ads_consent=essential', 'lf_ads_consent=all; lf_ad_optout=1', 'lf_ads_consent=all; lf_qa=1', 'lf_ads_consent=all; lf_tester=1']) {
      const { created, oaiq } = runBootstrap(cookie);
      expect(created, cookie).toEqual([]);
      expect(oaiq, cookie).toBeUndefined();
    }
    const flagged = runBootstrap('lf_ads_consent=all', { __lf_tester: 1 });
    expect(flagged.created).toEqual([]);
    expect(flagged.oaiq).toBeUndefined();

    const allowed = runBootstrap('theme=1; lf_ads_consent=all');
    expect(allowed.created).toEqual([
      expect.objectContaining({ src: 'https://bzrcdn.openai.com/sdk/oaiq.min.js' }),
    ]);
    expect(typeof allowed.oaiq).toBe('function');

    const gate = readFileSync('components/analytics/AdMeasurementGate.tsx', 'utf8');
    const loader = gate.slice(gate.indexOf('function OpenAiPixelLoader'));
    expect(loader).toContain('marketingTagsAllowed');
    expect(loader.indexOf('marketingTagsAllowed')).toBeLessThan(loader.indexOf('openAiPixelBootstrap'));
  });
});
