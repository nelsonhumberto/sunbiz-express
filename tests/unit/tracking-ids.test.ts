import { afterEach, describe, expect, it } from 'vitest';
import { OPENAI_PIXEL_ID_FALLBACK, openAiPixelId, publicEnvOrFallback } from '@/lib/tracking-ids';

const OPENAI_PIXEL_ENV = 'NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID';
const LAUNCHFORMA_PIXEL_ID = 'HLuEiBiKzL32aoTo43Z5BV';

describe('public tracking id fallbacks', () => {
  it('uses the known production id when the env var is unset', () => {
    expect(publicEnvOrFallback(undefined, OPENAI_PIXEL_ID_FALLBACK)).toBe(LAUNCHFORMA_PIXEL_ID);
  });

  it('disables the tag when the env var is empty', () => {
    expect(publicEnvOrFallback('', OPENAI_PIXEL_ID_FALLBACK)).toBeNull();
    expect(publicEnvOrFallback('   ', OPENAI_PIXEL_ID_FALLBACK)).toBeNull();
  });

  it('prefers an explicit override', () => {
    expect(publicEnvOrFallback('CustomPixelId123', 'fallback')).toBe('CustomPixelId123');
  });
});

describe('openAiPixelId', () => {
  const previous = process.env[OPENAI_PIXEL_ENV];

  afterEach(() => {
    if (previous === undefined) delete process.env[OPENAI_PIXEL_ENV];
    else process.env[OPENAI_PIXEL_ENV] = previous;
  });

  it('defaults to the LaunchForma pixel when the env var is unset', () => {
    delete process.env[OPENAI_PIXEL_ENV];
    expect(OPENAI_PIXEL_ID_FALLBACK).toBe(LAUNCHFORMA_PIXEL_ID);
    expect(openAiPixelId()).toBe(LAUNCHFORMA_PIXEL_ID);
  });

  it('reads NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID when set', () => {
    process.env[OPENAI_PIXEL_ENV] = 'CustomPixelId123';
    expect(openAiPixelId()).toBe('CustomPixelId123');
  });

  it('disables the pixel when the env var is empty', () => {
    process.env[OPENAI_PIXEL_ENV] = '  ';
    expect(openAiPixelId()).toBeNull();
  });
});
