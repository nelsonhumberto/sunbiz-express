import { describe, expect, it } from 'vitest';
import { OPENAI_PIXEL_ID_FALLBACK } from '@/lib/tracking-ids';
import { openAiPixelBootstrap } from '@/lib/openai-pixel';

describe('OpenAI Ads pixel bootstrap', () => {
  it('loads the production pixel and initializes it', () => {
    expect(OPENAI_PIXEL_ID_FALLBACK).toBe('HLuEiBiKzL32aoTo43Z5BV');

    const snippet = openAiPixelBootstrap(OPENAI_PIXEL_ID_FALLBACK);
    expect(snippet).toContain('https://bzrcdn.openai.com/sdk/oaiq.min.js');
    expect(snippet).toContain('oaiq("init", { pixelId: "HLuEiBiKzL32aoTo43Z5BV" })');
    expect(snippet).not.toContain('lead_created');
  });
});
