import { describe, expect, it } from 'vitest';
import {
  LINKEDIN_PARTNER_ID_FALLBACK,
  OPENAI_PIXEL_ID_FALLBACK,
  publicEnvOrFallback,
} from '@/lib/tracking-ids';

describe('public tracking id fallbacks', () => {
  it('uses the known production ids when the env var is unset', () => {
    expect(publicEnvOrFallback(undefined, LINKEDIN_PARTNER_ID_FALLBACK)).toBe('9874554');
    expect(publicEnvOrFallback(undefined, OPENAI_PIXEL_ID_FALLBACK)).toBe('RGTsQvtsZwqyMxRX2Lr4Zj');
  });

  it('disables the tag when the env var is empty', () => {
    expect(publicEnvOrFallback('', LINKEDIN_PARTNER_ID_FALLBACK)).toBeNull();
    expect(publicEnvOrFallback('   ', OPENAI_PIXEL_ID_FALLBACK)).toBeNull();
  });

  it('prefers an explicit override', () => {
    expect(publicEnvOrFallback('111', LINKEDIN_PARTNER_ID_FALLBACK)).toBe('111');
  });
});
